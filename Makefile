.PHONY: help install dev-web dev-api build build-web build-api \
        docker-up docker-down docker-restart docker-logs docker-shell \
        lint test-api typecheck clean clean-build export-db import-db

PROJECT_NAME=spider-app
DB_CONTAINER=spider-app-mysql
DB_NAME=pro_spider_app_db
DB_USER=missiria
DB_ROOT_PASSWORD=spider_Root!2026x

help:
	@echo ""
	@echo "  Spider App Monorepo - available commands"
	@echo ""
	@echo "  INSTALL"
	@echo "    make install          Install all workspace dependencies"
	@echo ""
	@echo "  DEVELOPMENT"
	@echo "    make docker-up        Start MySQL on :3403"
	@echo "    make dev-api          Start NestJS API on :8012"
	@echo "    make dev-web          Start Next.js frontend on :3010"
	@echo ""
	@echo "  BUILD"
	@echo "    make build            Build both workspaces"
	@echo "    make build-web        Build Next.js frontend"
	@echo "    make build-api        Compile NestJS API"
	@echo ""
	@echo "  DOCKER"
	@echo "    make docker-up        Start MySQL container"
	@echo "    make docker-down      Stop and remove containers"
	@echo "    make docker-logs      Tail MySQL logs"
	@echo "    make docker-shell     Open MySQL shell"
	@echo ""
	@echo "  CODE QUALITY"
	@echo "    make lint             Run ESLint in both workspaces"
	@echo "    make test-api         Run API tests"
	@echo "    make typecheck        Run API TypeScript checks"
	@echo ""
	@echo "  CLEAN"
	@echo "    make clean-build      Remove build artifacts"
	@echo "    make clean            Remove dependencies and build artifacts"
	@echo ""

install:
	npm install

dev-web:
	npm run dev:web

dev-api:
	npm run dev:api

build: build-api build-web

build-web:
	NODE_OPTIONS="--max-old-space-size=4096" npm run build:web

build-api:
	npm run build:api

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-restart:
	docker compose restart

docker-logs:
	docker compose logs -f mysql

docker-shell:
	docker compose exec mysql mysql -u $(DB_USER) -p $(DB_NAME)

lint:
	npm run lint

test-api:
	npm run test:api

typecheck:
	cd api && npx tsc --noEmit

clean-build:
	rm -rf web/.next api/dist

clean: clean-build
	rm -rf node_modules web/node_modules api/node_modules package-lock.json

export-db:
	docker compose exec mysql mysqldump -u root -p$(DB_ROOT_PASSWORD) $(DB_NAME) > db_backup.sql

import-db:
	docker compose exec -T mysql mysql -u root -p$(DB_ROOT_PASSWORD) $(DB_NAME) < db_backup.sql
