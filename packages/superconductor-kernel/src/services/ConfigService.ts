import { z } from "zod";
import fs from "fs";
import path from "path";
import os from "os";

const ConfigSchema = z.object({
  registries: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      type: z.enum(["git", "url"]),
      characteristics: z.array(z.string()),
      localPath: z.string().optional(),
      isDefaultPublishTarget: z.boolean().optional().default(false),
    })
  ),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigService {
  public static getConfig(): Config {
    const homeConfig = path.join(os.homedir(), ".design_os", "design-os.config.json");
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    const projectConfig = path.join(projectRoot, "design-os.config.json");

    const configPath = fs.existsSync(homeConfig) ? homeConfig : projectConfig;

    if (!fs.existsSync(configPath)) {
      console.warn(`[ConfigService] Config file not found at ${configPath}. Using empty default.`);
      return { registries: [] };
    }

    try {
      const fileContent = fs.readFileSync(configPath, "utf-8");
      const parsedJson = JSON.parse(fileContent);
      return ConfigSchema.parse(parsedJson);
    } catch (error) {
      console.error(`[ConfigService] Failed to read or parse config at ${configPath}. Using empty default. Error:`, error instanceof Error ? error.message : String(error));
      return { registries: [] };
    }
  }

  public static saveConfig(config: Config): void {
    const configPath = path.join(os.homedir(), ".design_os", "design-os.config.json");
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  }
}
