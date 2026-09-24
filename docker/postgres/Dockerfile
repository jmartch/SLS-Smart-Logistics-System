FROM postgres@sha256:0b657ff48d7f76a1e907f381b1693eb4f2bf54c1d2df4feb6743d7dc601768dd

RUN set -eux; \
    original_version="$(postgres --version)"; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        postgresql-17-postgis-3 \
        postgresql-17-postgis-3-scripts; \
    test "$(postgres --version)" = "$original_version"; \
    rm -rf /var/lib/apt/lists/*