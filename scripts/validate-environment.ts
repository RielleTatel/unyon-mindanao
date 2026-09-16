import {
  type AppEnvironment,
  EnvironmentConfigurationError,
  validateEnvironment,
} from "../src/shared/config/environment.js";

const requestedEnvironment = process.argv[2] as AppEnvironment | undefined;

if (!requestedEnvironment) {
  throw new EnvironmentConfigurationError(
    "Provide one environment: local, preview, or production",
  );
}

const environment = validateEnvironment(requestedEnvironment, process.env);

process.stdout.write(
  `Environment valid for ${environment.appEnvironment}: ${environment.appOrigin}\n`,
);
