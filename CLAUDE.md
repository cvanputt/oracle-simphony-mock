# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a mock environment for Oracle Simphony (POS) and OPERA (PMS) integrations using MockServer for HTTP routing and Node.js Express services for state management. The architecture consists of:

- **MockServer containers** (`mock-simphony`, `mock-opera`) on ports 4010/4020 that route API calls using init.json configurations
- **State services** (`simphony-state`, `opera-state`) on ports 5101/5102 that persist data to JSON files and handle business logic
- **Automatic integration** between Simphony and OPERA for room charge tenders when `SIMPHONY_AUTO_POST=true`

## Key Commands

### Docker Operations
```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f [service-name]

# Stop all services
docker compose down

# Rebuild specific service
docker compose up -d --build [service-name]
```

### Initial Setup
```bash
# Create required data files
mkdir -p data
echo '{}' > data/simphony.json
echo '{}' > data/opera.json
```

### State Service Development
```bash
# Install dependencies (in state/opera/ or state/simphony/)
npm ci

# Run state service locally (for development)
node server.js
```

## Architecture Details

### Service Communication Flow
1. **Simphony Mock** (port 4010) forwards `/sts/v2/checks/*` to `simphony-state:5000`
2. **OPERA Mock** (port 4020) forwards `/opera/v1/guests` and `/opera/v1/folios/*` to `opera-state:5000`
3. **Auto-posting**: When tendering with `ROOM_CHARGE`, simphony-state calls opera-state directly via internal Docker network

### State Management
- Data persisted to `./data/simphony.json` and `./data/opera.json`
- State services use simple JSON file storage with load/save functions
- Check calculations include hardcoded pricing, tax (9%), and service charges (10%)

### Key Environment Variables
- `SIMPHONY_AUTO_POST`: Controls automatic folio posting on room charges
- `SIMPHONY_TRANSACTION_CODE`: Default transaction code for OPERA postings (default: "ROOM_SERVICE")

### Testing Workflow
Use the smoke test commands from README.md to verify end-to-end functionality. The workflow tests: guest seeding → menu fetching → check creation → item addition → room charge tendering → folio verification.