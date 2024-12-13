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

function readFile(file) {
  return readFileSync(resolve(__dirname, file), "utf-8");
}

const QUOTES = readFile("quotes.txt").split("\n");
const IDIOMS = JSON.parse(readFile("idioms.json"));

function getRandomIdiom() {
  let idioms = Object.keys(IDIOMS);
  return idioms[Math.floor(Math.random() * idioms.length)];
}

function parseIdiom(idiom) {
  let pinyins = IDIOMS[idiom];

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

let guessing = false;
let answer = "";
let guesses = [];
let hint = -1;

export function apply(ctx: Context) {
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
  ctx.command("猜成语 <command>").action(async ({ session }, command) => {
    switch (command) {
      case "开始":
        if (guessing) {
          await session.send("游戏正在进行中");
          return ctx.puppeteer.render(generateHtml(answer, guesses));
        } else {
          guessing = true;
          answer = getRandomIdiom();
          guesses = [];
          hint = -1;
          return "游戏开始！直接发送四字成语即可参与游戏~";
        }
      case "结束":
        if (guessing) {
          guessing = false;
          guesses.push(answer);
          await session.send(`游戏结束！答案是“${answer}”，再接再厉哦~`);
          return ctx.puppeteer.render(generateHtml(answer, guesses));
        } else {
          return "当前没有正在进行的游戏";
        }
      case "提示":
        if (!guessing) {
          return "当前没有正在进行的游戏";
        }

        if (hint === -1) {
          hint = Math.floor(Math.random() * 4);
        }

        return `答案的第${["一", "二", "三", "四"][hint]}个字是“${
          answer[hint]
        }”`;
      default:
        return "无效指令";
    }
  });
  ctx.on("message", async (session) => {
    if (
      !guessing ||
      session.content.length !== 4 ||
      !parseIdiom(session.content)
    ) {
      return;
    }

    guesses.push(session.content);

    if (session.content === answer) {
      guessing = false;
      await session.send(
        `恭喜你猜对了！答案是“${answer}”，共猜了${guesses.length}次~`
      );
    }

    await session.send(
      await ctx.puppeteer.render(generateHtml(answer, guesses))
    );
  });
}
