# Build stage — compile Elixir release
# Uses same base images as vNext for consistency
FROM hexpm/elixir:1.19.3-erlang-28.1.1-debian-bookworm-20260112-slim AS builder

RUN apt-get update -y && apt-get install -y build-essential git \
    && apt-get clean && rm -f /var/lib/apt/lists/*_*

WORKDIR /app

ENV MIX_ENV="prod"

# Install hex + rebar
RUN mix local.hex --force && \
    mix local.rebar --force

# Install mix dependencies
COPY mix.exs mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config

# Copy compile-time config
COPY config/config.exs config/${MIX_ENV}.exs config/
RUN mix deps.compile

# Copy application code
COPY priv priv
COPY lib lib

RUN mix compile

# Copy runtime config
COPY config/runtime.exs config/

# Copy release overlays
COPY rel rel

RUN mix release

# Runtime stage — minimal image
FROM debian:bookworm-20260112-slim

RUN apt-get update -y && \
    apt-get install -y libstdc++6 openssl libncurses5 locales ca-certificates \
    && apt-get clean && rm -f /var/lib/apt/lists/*_*

# Set the locale
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

WORKDIR "/app"
RUN chown nobody /app

# Create data directory for SQLite volume mount
RUN mkdir -p /data && chown nobody /data

ENV MIX_ENV="prod"

# Copy the compiled release from builder
COPY --from=builder --chown=nobody:root /app/_build/${MIX_ENV}/rel/rockcut_api ./

USER nobody

CMD ["/app/bin/server"]
