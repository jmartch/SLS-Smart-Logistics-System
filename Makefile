INTEGRATION_COMPOSE = docker compose \
	-f docker-compose.yml \
	-f docker-compose.integration.yml \
	--profile integration

INTEGRATION_DB_URL = postgresql://integration_admin:integration_test_password@integration-postgres:5432/postgres

INTEGRATION_TESTS = gdb-01 gdb-05 gdb-06 geocode-01 assign-01 route-01 delivery-01 route-close-01 rmq-01 registration-01 auth-tenant-01 demo-01

.PHONY: integration-db-up integration-db-down integration-db-status integration-test

integration-db-up:
	$(INTEGRATION_COMPOSE) up -d --wait integration-postgres

integration-db-down:
	$(INTEGRATION_COMPOSE) rm -sf integration-postgres

integration-db-status:
	$(INTEGRATION_COMPOSE) ps integration-postgres

integration-test:
	@test -n "$(TEST)" || { \
		echo "Uso: make integration-test TEST=<test>"; \
		echo "Disponibles: $(INTEGRATION_TESTS)"; \
		exit 2; \
	}
	@case " $(INTEGRATION_TESTS) " in \
		*" $(TEST) "*) ;; \
		*) \
			echo "Test no soportado: $(TEST)"; \
			echo "Disponibles: $(INTEGRATION_TESTS)"; \
			exit 2; \
			;; \
	esac
	@$(MAKE) integration-db-up
	docker compose exec \
		-e 'GDB_TEST_ADMIN_URL=$(INTEGRATION_DB_URL)' \
		backend npm run test:$(TEST)