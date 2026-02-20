# pipelines/core

The `pipelines/core` package provides a standardized way to handle common tasks, ensuring consistency and efficiency in pipeline development. It includes the following modules:

- `data`: defines common data classes used across pipelines.
- `load`: provides functions to download/upload data from/to various sources, such as IBF-system or Azure blob storage.
- `logger`: logging utility that provides a standardized way to log messages, errors, and other information during pipeline execution.
- `module`: base class for creating pipeline modules, providing common functionalities and interfaces for module development.
- `secrets`: handles sensitive information such as API keys, passwords, and other credentials.
- `settings`: manages configuration settings for the pipelines, from a standardized YAML file. It provides methods to load, validate, and access configuration parameters.
