import logging

import click
from pipelines.core.secrets import Secrets
from pipelines.core.settings import Settings
from pipelines.drought.pipeline import Pipeline as DroughtPipeline
from pipelines.riverflood.pipeline import Pipeline as RiverFloodPipeline


@click.command()
@click.option("--hazard", help="hazard name", default="riverflood")
@click.option("--country", help="country ISO3", default="UGA")
@click.option("--prepare", help="prepare discharge data", default=False, is_flag=True)
@click.option("--forecast", help="forecast floods", default=False, is_flag=True)
@click.option("--send", help="send to IBF", default=False, is_flag=True)
@click.option(
    "--debug",
    "-d",
    help="run pipeline in debug mode",
    default=False,
    is_flag=True,
)
@click.option(
    "--no-cache",
    "-nc",
    help="ignore cache",
    default=False,
    is_flag=True,
)
def pipeline(hazard, country, prepare, forecast, send, debug, no_cache):
    country = country.upper()
    try:
        if hazard.lower() == "riverflood":
            pipeline = RiverFloodPipeline(
                country=country,
                hazard=hazard,
                settings=Settings("pipelines/riverflood/config.yaml"),
                secrets=Secrets(".env"),
                no_cache=no_cache,
            )
        elif hazard.lower() == "drought":
            pipeline = DroughtPipeline(
                country=country,
                hazard=hazard,
                settings=Settings("pipelines/drought/config.yaml"),
                secrets=Secrets(".env"),
                no_cache=no_cache,
            )
        else:
            raise ValueError(f"Hazard {hazard} not supported.")
    except FileNotFoundError as e:
        logging.warning(f"Dataset unavailable: {e}, skipping country {country}")
        return

    pipeline.run(
        prepare=prepare,
        forecast=forecast,
        send=send,
        debug=debug,
    )


if __name__ == "__main__":
    pipeline()
