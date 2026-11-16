import file from "../../components.json" with { type: "json" };

export type Probe =
  | { kind: "http"; url: string; expect: number; contains?: string; slowMs: number }
  | { kind: "dns-soa"; zone: string; slowMs: number };

export interface Component {
  id: string;
  name: string;
  probe: Probe;
}

export const components = file.components as Component[];

export interface Settings {
  /** Shown on the page as where the checks run from, like "East US 2". */
  region: string;
  pageUrl: string;
  discordWebhook?: string;
  /** Pinged after every run, so a dead man's switch notices if the checker stops. */
  heartbeat?: string;
}

export function settings(env = process.env): Settings {
  return {
    region: env.STATUS_REGION || "Azure",
    pageUrl: env.STATUS_PAGE_URL || "https://status.raptorpanel.net",
    discordWebhook: env.DISCORD_WEBHOOK_URL || undefined,
    heartbeat: env.HEARTBEAT_URL || undefined,
  };
}
