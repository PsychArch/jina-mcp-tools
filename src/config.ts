type SearchEndpoint = "standard" | "vip";
type TransportType = "stdio" | "http";

export interface ServerConfig {
  cacheSize: number;
  host: string;
  port: number;
  searchEndpoint: SearchEndpoint;
  tokensPerPage: number;
  transport: TransportType;
}

export const DEFAULT_CONFIG: ServerConfig = {
  cacheSize: 50,
  host: "127.0.0.1",
  port: 3000,
  searchEndpoint: "standard",
  tokensPerPage: 15000,
  transport: "stdio"
};

export const USAGE = `Usage: jina-mcp-tools [options]

Options:
  --transport <stdio|http>         Transport type (default: stdio)
  --host <host>                    Host/interface to bind in HTTP mode (default: 127.0.0.1)
  --port <1-65535>                 HTTP server port (default: 3000)
  --tokens-per-page <positive-int> Tokens per page for pagination (default: 15000)
  --search-endpoint <standard|vip> Search endpoint to use (default: standard)
  --cache-size <positive-int>      Reader cache size (default: 50)
  -h, --help                       Show this help message`;

export class CliUsageError extends Error {
  readonly exitCode = 1;
}

export class CliHelpRequested extends Error {
  readonly exitCode = 0;

  constructor() {
    super(USAGE);
  }
}

export const formatHostForUrl = (hostValue: string): string => {
  return hostValue.includes(":") && !hostValue.startsWith("[") ? `[${hostValue}]` : hostValue;
};

const failCli = (message: string): never => {
  throw new CliUsageError(message);
};

const getOptionValue = (args: string[], index: number, option: string): string => {
  const value = args[index + 1];

  if (value === undefined) {
    failCli(`Missing value for ${option}.`);
  }

  if (value.startsWith("-")) {
    failCli(`Expected a value for ${option}, received another option: ${value}`);
  }

  return value;
};

const parsePositiveInteger = (
  value: string,
  option: string,
  max?: number
): number => {
  if (!/^\d+$/.test(value)) {
    failCli(`Invalid value for ${option}: ${value}. Expected a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    failCli(`Invalid value for ${option}: ${value}. Expected a positive integer.`);
  }

  if (max !== undefined && parsed > max) {
    failCli(`Invalid value for ${option}: ${value}. Maximum allowed value is ${max}.`);
  }

  return parsed;
};

export const parseArgs = (args: string[]): ServerConfig => {
  const config: ServerConfig = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === undefined) {
      continue;
    }

    switch (arg) {
      case "-h":
      case "--help":
        throw new CliHelpRequested();
      case "--tokens-per-page":
        config.tokensPerPage = parsePositiveInteger(
          getOptionValue(args, i, arg),
          arg
        );
        i++;
        break;
      case "--search-endpoint": {
        const endpoint = getOptionValue(args, i, arg).toLowerCase();
        if (endpoint !== "standard" && endpoint !== "vip") {
          failCli(`Invalid value for ${arg}: ${endpoint}. Expected standard or vip.`);
        }
        config.searchEndpoint = endpoint as SearchEndpoint;
        i++;
        break;
      }
      case "--transport": {
        const selectedTransport = getOptionValue(args, i, arg).toLowerCase();
        if (selectedTransport !== "stdio" && selectedTransport !== "http") {
          failCli(`Invalid value for ${arg}: ${selectedTransport}. Expected stdio or http.`);
        }
        config.transport = selectedTransport as TransportType;
        i++;
        break;
      }
      case "--port":
        config.port = parsePositiveInteger(getOptionValue(args, i, arg), arg, 65535);
        i++;
        break;
      case "--host": {
        const host = getOptionValue(args, i, arg).trim();
        if (!host) {
          failCli(`Invalid value for ${arg}: host cannot be empty.`);
        }
        config.host = host;
        i++;
        break;
      }
      case "--cache-size":
        config.cacheSize = parsePositiveInteger(getOptionValue(args, i, arg), arg);
        i++;
        break;
      default:
        failCli(`Unknown argument: ${arg}`);
    }
  }

  return config;
};

export const formatCliError = (error: Error): string => {
  return `${error.message}\n\n${USAGE}`;
};
