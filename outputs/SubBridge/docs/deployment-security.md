# Deployment and security

## Local machine

By default SubBridge binds to `127.0.0.1`, so only programs on that machine can connect. Keep the listener local and protect the generated gateway token. The API and dashboard check the Host and Origin headers, require bearer auth for `/v1` API routes, and apply local rate/concurrency limits. No third-party telemetry is included.

## Docker

Inside a container, `127.0.0.1` means the container itself. A host application cannot reach a container's loopback listener. If you run SubBridge in Docker for local development, bind the container service to its container interface and publish the port only to host loopback:

```yaml
services:
  subbridge:
    ports:
      - "127.0.0.1:8787:8787"
    environment:
      SUBBRIDGE_HOST: "0.0.0.0"
      SUBBRIDGE_ALLOW_REMOTE: "true" # container interface only; host mapping stays loopback
```

Configure the app in that same host to call `http://127.0.0.1:8787/v1`. Provider CLIs, their login profiles, and Ollama also need to be deliberately made available inside the container; do not mount a broad home directory or copy credentials into an image.

## Remote application, SSH tunnel

An application on another machine cannot use `127.0.0.1` to reach your computer: that address always refers to the machine where the application process runs. For personal use, establish an SSH tunnel from the app machine to your gateway machine, with the remote SubBridge listener still bound to loopback:

```sh
# Run on the app machine; replace user and gateway-host.
ssh -N -L 8787:127.0.0.1:8787 user@gateway-host
```

The remote app can then use its own `http://127.0.0.1:8787/v1`; the tunnel encrypts the connection. Keep SSH access restricted and the gateway token private. For EC2, keep the SubBridge listener on the instance loopback, do not add a public inbound security-group rule for port 8787, and use an SSH tunnel or a deliberately restricted private network from the application host. Private networking or a VPN can also work, but SubBridge is designed and tested for local loopback use. Do not expose it to the public internet. `SUBBRIDGE_HOST` remote binding is not a substitute for TLS, network controls, or a hardened remote service.

## Credentials and provider policy

The gateway token authenticates callers to this local service; it is separate from provider login. Provider credentials stay with the provider's own CLI or local service and are never returned by SubBridge. Request history defaults to metadata only; setting full history stores prompt and answer text locally. Never log or share either the gateway token or provider auth files.

SubBridge does not bypass provider authentication, rate limits, or subscription checks. A provider's subscription may prohibit use through a generic proxy or third-party integration. Confirm the provider's current terms and use an integration that the provider allows. Claude Code is detected but is not activated by SubBridge. Ollama runs local models and has no provider account auth.
