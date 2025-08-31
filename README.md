# Oracle Hospitality Mock Environment

This project emulates **Oracle Simphony (POS)** and **OPERA (PMS)** integrations using [MockServer](https://www.mock-server.com/) for HTTP routing plus lightweight **state services** (Node/Express) that persist data to JSON files.

It lets you build and test against a realistic local mock of:

- **Simphony OAuth2/OIDC Authentication** (PKCE flow, token management)
- **Simphony Transaction Services** (checks, menu, tenders)
- **OPERA guest lookup** and **folio posting**
- Automatic folio posting when Simphony tenders a check to **Room Charge**, just like **Simphony OPERA Connection** in production
- Configurable **transaction codes** (env-driven)

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [curl](https://curl.se/) and [jq](https://stedolan.github.io/jq/) (for smoke tests)

---

## Setup

1. Clone this repo and `cd` into it.
2. Create persistent data files for the state services:

```bash
mkdir -p data
echo '{}' > data/simphony.json
echo '{}' > data/opera.json
```

3. Build and start everything:

```bash
docker compose up -d --build
```

---

## Services & Ports

| Service        | Host URL                                       | Purpose                                    |
| -------------- | ---------------------------------------------- | ------------------------------------------ |
| mock-simphony  | [http://localhost:4010](http://localhost:4010) | Simphony mock (menu, checks, tenders)      |
| mock-opera     | [http://localhost:4020](http://localhost:4020) | OPERA mock (guests, folios)                |
| simphony-state | [http://localhost:5101](http://localhost:5101) | Stateful datastore for Simphony checks     |
| opera-state    | [http://localhost:5102](http://localhost:5102) | Stateful datastore for OPERA folios/guests |

> **Note:** Your app should call `http://localhost:4010` (Simphony) and `http://localhost:4020` (OPERA).
> The state services are behind the scenes and not called directly in production-like usage.

---

## Environment Variables

You can tune behavior by editing `docker-compose.yml`:

- **`SIMPHONY_AUTO_POST`**

  - `true` → When Simphony tenders a check with `ROOM_CHARGE`, the service automatically posts the charge to OPERA (production-like).
  - `false` → Simphony closes the check but your app must call OPERA’s folio API itself.

- **`SIMPHONY_TRANSACTION_CODE`**

  - Default transaction code used when posting folio charges (e.g. `ROOM_SERVICE`, `MINIBAR`).
  - Can be overridden per-request by passing `transactionCode` in the tender payload.

---

## Smoke Test

Run these commands end-to-end to confirm everything works:

### 1. Seed a Guest in OPERA

```bash
curl -s -X POST http://localhost:5102/__seed/guest \
  -H 'Content-Type: application/json' \
  -d '{"room":"203","lastName":"Nguyen","reservationId":"RES-555","guestName":"Taylor Nguyen"}' | jq .
```

### 2. Fetch Menu Summaries (via Simphony Mock)

```bash
curl -s "http://localhost:4010/menus/summary?OrgShortName=test&LocRef=test&RvcRef=test" | jq .
```

### 3. Fetch Specific Menu (via Simphony Mock)

```bash
curl -s -H "Simphony-OrgShortName: test" -H "Simphony-LocRef: test" -H "Simphony-RvcRef: test" http://localhost:4010/menus/1233 | jq .
```

### 4. Fetch Checks (via Simphony Mock)

```bash
# Get all checks
curl -s "http://localhost:4010/checks" | jq .

# Get checks with query parameters
curl -s "http://localhost:4010/checks?checkEmployeeRef=123&includeClosed=true&orderTypeRef=1&tableName=Table%201" | jq .

# Get specific check by ID
curl -s "http://localhost:4010/checks/CHK-001" | jq .
```

### 5. Create a Check

```bash
CHK=$(curl -s -X POST http://localhost:4010/sts/v2/checks | jq -r .checkId)
echo "Check ID: $CHK"
```

### 6. Add Items to Check

```bash
curl -s -X POST http://localhost:4010/sts/v2/checks/$CHK/items \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"RS-BURGER","qty":1},{"sku":"RS-FRIES","qty":1}]}' | jq .
```

### 7. Tender to Room Charge (auto-posts to OPERA)

```bash
curl -s -X POST http://localhost:4010/sts/v2/checks/$CHK/tenders \
  -H 'Content-Type: application/json' \
  -d '{"type":"ROOM_CHARGE","roomNumber":"203","lastName":"Nguyen"}' | jq .
```

### 8. Verify Folio in OPERA

```bash
curl -s http://localhost:4020/opera/v1/folios/RES-555 | jq .
```

Expected result: the folio shows a new line with your transaction code (default: `ROOM_SERVICE`) and the total amount of the order.

---

## OIDC Authentication Testing

The mock also supports OAuth2 PKCE authentication flow for testing `SimphonyAuthService`:

### 1. Test OpenID Configuration

```bash
curl -s "http://localhost:4010/oidc-provider/v1/.well-known/openid-configuration" | jq .
```

### 2. Test Authorization Endpoint

```bash
curl -s "http://localhost:4010/oidc-provider/v1/oauth2/authorize?response_type=code&client_id=test&scope=openid&redirect_uri=apiaccount://callback&code_challenge=test&code_challenge_method=S256"
```

### 3. Test Sign-in Endpoint

```bash
curl -s -X POST "http://localhost:4010/oidc-provider/v1/oauth2/signin" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test&password=test" | jq .
```

### 4. Test Token Endpoint (Authorization Code)

```bash
curl -s -X POST "http://localhost:4010/oidc-provider/v1/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&client_id=test&code=mock_auth_code_12345&code_verifier=test&redirect_uri=apiaccount://callback" | jq .
```

### 5. Test Token Endpoint (Refresh Token)

```bash
curl -s -X POST "http://localhost:4010/oidc-provider/v1/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&client_id=test&refresh_token=mock_refresh_token_12345&redirect_uri=apiaccount://callback" | jq .
```

For detailed OIDC integration information, see [OIDC_INTEGRATION.md](./OIDC_INTEGRATION.md).

---

## Notes

- All state (checks, guests, folios) is persisted in `./data/*.json` so it survives container restarts.
- Use `SIMPHONY_AUTO_POST=false` if you want to test manual folio posting workflows.
- Use `transactionCode` in the tender payload to override the environment default.

---

Would you like me to also add a **section with sample request/response payloads** (like a mini API reference) to the README so developers know exactly what to send and expect for each endpoint?
