#!/bin/bash
set -Eeuo pipefail

open http://localhost:4000/docs # OpenAPI docs
open http://localhost:9000/ # pg_featureserv
open http://localhost:7800/ # pg_tileserv
open 'http://localhost:3000/nrw?c=MWI' # Frontend
