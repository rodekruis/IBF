# Databricks notebook source
# Thin notebook wrapper to invoke the pipeline on Databricks.
#
# Why this exists instead of just a Python Wheel job: only ``{{job.*}}`` /
# ``{{task.*}}`` / ``{{workspace.*}}`` are resolved on Databricks.
# NRW secrets are fetched here via ``dbutils.secrets.get`` and exported
# as env vars before calling the wheel's run function.

import os

from pipelines.infra.run_forecasts import run_forecasts

# COMMAND ----------

dbutils.widgets.text("config_path", "")
dbutils.widgets.text("run_target", "DEBUG")
dbutils.widgets.text("scenario", "")
dbutils.widgets.text("secret_scope", "nrw")

config_path = dbutils.widgets.get("config_path")
run_target = dbutils.widgets.get("run_target")
scenario_str = dbutils.widgets.get("scenario") or None
secret_scope = dbutils.widgets.get("secret_scope")

if not config_path:
    raise ValueError("config_path widget must be set")

# COMMAND ----------

os.environ["IBF_API_URL"] = dbutils.secrets.get(secret_scope, "IBF_API_URL")
os.environ["IBF_PIPELINE_API_KEY"] = dbutils.secrets.get(
    secret_scope, "IBF_PIPELINE_API_KEY"
)
os.environ.setdefault(
    "GITHUB_DATA_BASE_URL",
    "https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main",
)

# COMMAND ----------

from pipelines.infra.data_types.data_config_types import Scenario, ScenarioType

scenario = Scenario(type=ScenarioType(scenario_str)) if scenario_str else None

errors = run_forecasts(config_path, run_target, scenario=scenario)
if errors:
    raise RuntimeError(f"Pipeline finished with errors: {errors}")
