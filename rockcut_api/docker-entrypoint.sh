#!/bin/bash
set -e

mix deps.get
mix ecto.create
mix ecto.migrate
exec mix phx.server
