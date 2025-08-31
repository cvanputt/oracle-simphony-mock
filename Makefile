.PHONY: up down build logs start stop restart status clean generate-init

# Start all docker compose services (including state servers)
up: 
	docker compose up

# Stop all services
down:
	docker compose down

# Stop everything
stop: down

# Restart all services
restart: down start

# Build all services (including state servers that use Dockerfiles)
build:
	docker compose build

# Generate init.json from menu-items.json
generate-init:
	@echo "Generating init.json from menu-items.json..."
	@node scripts/generate-init.js

# View logs for all services
logs:
	docker compose logs -f

# View logs for specific services
logs-simphony:
	docker compose logs -f mock-simphony simphony-state

logs-opera:
	docker compose logs -f mock-opera opera-state

# Check status of all services
status:
	@echo "=== Docker Compose Services Status ==="
	@docker compose ps
	@echo ""
	@echo "=== Container Status ==="
	@docker ps --filter "name=oracle-mocks" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Clean up everything (stop and remove containers, networks, volumes)
clean:
	@echo "Stopping all services..."
	@docker compose down -v
	@echo "Removing any remaining containers..."
	@docker rm -f $$(docker ps -aq --filter "name=oracle-mocks") 2>/dev/null || true
	@echo "Cleaning up completed"

# Initialize data files if they don't exist
init-data:
	@echo "Initializing data files..."
	@mkdir -p data
	@echo '{}' > data/simphony.json 2>/dev/null || true
	@echo '{}' > data/opera.json 2>/dev/null || true
	@echo "Data files initialized"

# Full setup (init data, build, and start)
setup: init-data build up

# Quick start (assumes already built)
quick: init-data generate-init up