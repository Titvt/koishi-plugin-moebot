import cnchar from "cnchar";
import { readFileSync } from "fs";
import { Context, Schema } from "koishi";
import {} from "koishi-plugin-puppeteer";
import { resolve } from "path";
import { findBestMatch } from "string-similarity";

export const name = "Koishi Plugin MoeBot";
export const using = ["puppeteer"];
export interface Config {}
export const Config: Schema<Config> = Schema.object({});

const GROUPS = {};

function getGroup(id) {
  if (!GROUPS[id]) {
    GROUPS[id] = {
      guessing: false,
      difficulty: "",
      answer: "",
      guesses: [],
      hint: -1,
    };
  }

  return GROUPS[id];
}

function readFile(file) {
  return readFileSync(resolve(__dirname, file), "utf-8");
}

const QUOTES = readFile("quotes.txt").split("\n");
const IDIOMS = JSON.parse(readFile("idioms.json"));
const IDIOMS_COMMON = JSON.parse(readFile("idioms_common.json"));

function getRandomIdiom(common) {
  let idioms = common ? Object.keys(IDIOMS_COMMON) : Object.keys(IDIOMS);
  return idioms[Math.floor(Math.random() * idioms.length)];
}

function parseIdiom(idiom) {
  let pinyins = IDIOMS[idiom].pinyin;

  if (!pinyins) {
    return null;
  }

  let result = {
    characters: idiom.split(""),
    lefts: [],
    rights: [],
    wrongs: [],
  };

  for (let pinyin of pinyins.split(" ")) {
    let left = cnchar.spellInfo(pinyin).initial;
    let right = pinyin.substring(left.length);
    let wrong = cnchar.transformTone(pinyin).spell.substring(left.length);
    result.lefts.push(left);
    result.rights.push(right);
    result.wrongs.push(wrong);
  }

  return result;
}

function generateHtml(answer, guesses) {
  let content = "";
  let answerIdiom = parseIdiom(answer);

  for (let guess of guesses) {
    content += `
      <div class="row">
    `;
    let guessIdiom = parseIdiom(guess);

    for (let i = 0; i < 4; i++) {
      let character = guessIdiom.characters[i];
      let left = guessIdiom.lefts[i];
      let right = guessIdiom.rights[i];
      let wrong = guessIdiom.wrongs[i];

      if (
        character === answerIdiom.characters[i] &&
        left === answerIdiom.lefts[i] &&
        right === answerIdiom.rights[i]
      ) {
        content += `
        <div class="block correct">
          <div class="pinyin">
            <span>${left}</span>
            <span>${right}</span>
          </div>
          <div class="character">${character}</div>
        </div>
        `;
      } else {
        let characterColor = "";
        let leftColor = "";
        let rightColor = "";

        if (character === answerIdiom.characters[i]) {
          characterColor = "green";
        } else {
          for (let j = 0; j < 4; j++) {
            if (
              j !== i &&
              answerIdiom.characters[j] === character &&
              answerIdiom.characters[j] !== guessIdiom.characters[j]
            ) {
              characterColor = "orange";
              break;
            }
          }
        }

        if (left === answerIdiom.lefts[i]) {
          leftColor = "green";
        } else {
          for (let j = 0; j < 4; j++) {
            if (
              j !== i &&
              answerIdiom.lefts[j] === left &&
              answerIdiom.lefts[j] !== guessIdiom.lefts[j]
            ) {
              leftColor = "orange";
              break;
            }
          }
        }

        if (right === answerIdiom.rights[i]) {
          rightColor = "green";
        } else if (wrong === answerIdiom.wrongs[i]) {
          rightColor = "blue";
        } else {
          for (let j = 0; j < 4; j++) {
            if (
              j !== i &&
              answerIdiom.rights[j] === right &&
              answerIdiom.rights[j] !== guessIdiom.rights[j]
            ) {
              rightColor = "orange";
              break;
            }
          }
        }

        content += `
        <div class="block">
          <div class="pinyin">
            <span class="${leftColor}">${left}</span>
            <span class="${rightColor}">${right}</span>
          </div>
          <div class="character ${characterColor}">${character}</div>
        </div>
        `;
      }
    }

    content += `
      </div>
    `;
  }

  if (guesses[guesses.length - 1] !== answer) {
    content += `
      <div class="row">
        <div class="block empty"></div>
        <div class="block empty"></div>
        <div class="block empty"></div>
        <div class="block empty"></div>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body {
        width: fit-content;
        height: fit-content;
        margin: 0;
        padding: 20px;
      }
      .row {
        display: flex;
      }
      .block {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 4px;
        display: flex;
        justify-content: center;
        color: rgba(55, 65, 81, 1);
        background-color: rgba(156, 163, 175, 0.08);
        border: 2px solid rgba(156, 163, 175, 0.1);
      }
      .pinyin {
        position: absolute;
        left: 0;
        right: 0;
        top: 10px;
        display: flex;
        justify-content: center;
      }
      .character {
        position: absolute;
        top: 32px;
        font-size: 30px;
        line-height: 30px;
      }
      .empty {
        background-color: white;
      }
      .correct {
        color: white;
        background-color: rgba(29, 156, 156, 1);
      }
      .green {
        color: rgba(29, 156, 156, 1);
      }
      .orange {
        color: rgba(222, 117, 37, 1);
      }
      .blue {
        color: rgba(59, 130, 246, 1);
      }
    </style>
  </head>
  <body>
    <div class="col">
${content}
    </div>
  </body>
</html>
  `;
}

export function apply(ctx: Context) {
  ctx.guild();
  ctx.on("message", async (session) => {
    if (!session.content.includes("赢")) {
      return;
    }

    let text = session.quote?.content ?? session.content;
    let ratings = findBestMatch(text, QUOTES).ratings.filter(
      (rating) => rating.rating > 0
    );

    if (!ratings.length) {
      await session.send(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
      return;
    }

    let totalRating = ratings.reduce(
      (total, rating) => total + rating.rating,
      0
    );
    let random = Math.random() * totalRating;
    let current = 0;

    for (let rating of ratings) {
      current += rating.rating;

      if (current >= random) {
        await session.send(rating.target);
        return;
      }
    }
  });
  ctx
    .command("猜成语 <command> [difficulty]")
    .action(async ({ session }, command, difficulty) => {
      let group = getGroup(session.guildId);

      switch (command) {
        case "开始":
          if (group.guessing) {
            await session.send("游戏正在进行中");
            return ctx.puppeteer.render(
              generateHtml(group.answer, group.guesses)
            );
          } else {
            if (!difficulty) {
              difficulty = "简单";
            }

            if (!["简单", "困难", "噩梦"].includes(difficulty)) {
              return "可选难度：简单、困难、噩梦";
            }

            group.guessing = true;
            group.difficulty = difficulty;
            group.answer = getRandomIdiom(difficulty === "简单");
            group.guesses = [];
            group.hint = -1;
            return `游戏开始！本次游戏难度为${
              difficulty === "噩梦" ? "噩梦，你只有10次猜测机会" : difficulty
            }，直接发送四字成语即可参与游戏~`;
          }
        case "结束":
          if (group.guessing) {
            group.guessing = false;
            group.guesses.push(group.answer);
            await session.send(
              `很遗憾！你离正确答案就差那么一点点了，再接再厉哦~
${group.answer}：${IDIOMS[group.answer].explanation}`
            );
            return ctx.puppeteer.render(
              generateHtml(group.answer, group.guesses)
            );
          } else {
            return "当前没有正在进行的游戏";
          }
        case "提示":
          if (!group.guessing) {
            return "当前没有正在进行的游戏";
          }

          if (group.hint === -1) {
            group.hint = Math.floor(Math.random() * 4);
          }

          let hint1 =
            group.difficulty === "噩梦"
              ? "答案有四个字"
              : `答案的第${["一", "二", "三", "四"][group.hint]}个字是“${
                  group.answer[group.hint]
                }”`;
          let hint2 =
            group.difficulty === "简单"
              ? IDIOMS[group.answer].explanation
              : "答案是一个成语";
          return `提示一：${hint1}
提示二：${hint2}`;
        case "规则":
          return "在猜成语游戏中，我们的目标是根据已知信息猜出随机选取的四字成语，可以通过直接发送四字成语来参与游戏。\n当前版本的完整词库中共有29500+四字成语，常见词库中共有7200+四字成语，不在完整词库中的成语不会被识别，简单模式中只有常见词库中的成语才可能成为答案。\n每次猜测后，可以从图片中获取历史猜测的结果，我们需要根据结果中的字/声母/韵母的颜色提取出有效信息以便于更准确地猜出答案。\n绿色：这个字/声母/韵母是完全正确的\n橙色：这个字/声母/韵母的位置不正确，它不在当前位置和标记绿色的位置\n蓝色：这个韵母的声调不正确\n黑色：这个字/声母/韵母是完全错误的";
        default:
          return "无效指令";
      }
    });
  ctx.on("message", async (session) => {
    let group = getGroup(session.guildId);

    if (
      !group.guessing ||
      session.content.length !== 4 ||
      !parseIdiom(session.content)
    ) {
      return;
    }

    group.guesses.push(session.content);

    if (session.content === group.answer) {
      group.guessing = false;
      await session.send(
        `恭喜你猜对了！这么难的成语，竟然只猜了${
          group.guesses.length
        }次就猜到了正确答案，实在是太棒了~
${group.answer}：${IDIOMS[group.answer].explanation}`
      );
    }

    if (group.difficulty === "噩梦" && group.guesses.length >= 10) {
      group.guessing = false;
      group.guesses.push(group.answer);
      await session.send(
        `很遗憾！你离正确答案就差那么一点点了，再接再厉哦~
${group.answer}：${IDIOMS[group.answer].explanation}`
      );
    }

    await session.send(
      await ctx.puppeteer.render(generateHtml(group.answer, group.guesses))
    );
  });
}
