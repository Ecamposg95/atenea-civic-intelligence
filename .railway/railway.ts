import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "Agora";
export default defineRailway(() => {
  const Agora = service("Agora", {
    source: github("Ecamposg95/atenea-civic-intelligence", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "NIXPACKS" },
    start: ". /opt/venv/bin/activate && uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT",
    healthcheck: "/api/health",
    healthcheckTimeout: 100,
    replicas: { "us-west2": 1 },
    networking: { privateNetworkEndpoint: "web" },
  });

  return project("Atenea", {
    variables: { managed: false },
    resources: [Agora],
  });
});
