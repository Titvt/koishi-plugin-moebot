import { Context, Schema } from "koishi";

export const name = "Koishi Plugin MoeBot";

export interface Config {}

export const Config: Schema<Config> = Schema.object({});

export function apply(ctx: Context) {
  ctx.on("message", (session) => {
    if (session.content === "天王盖地虎") {
      session.send("宝塔镇河妖");
    }
  });
}
