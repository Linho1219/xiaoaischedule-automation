import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import chalk from "chalk";

const inputDir = "input";
const scriptPath = "src/dom.ts";
const tempPath = "dist/temp.ts";
const outputDir = "dist";

//#region Types

type TimeString = `${number}:${number}`;
type DateString = `${number}-${number}-${number}`;

interface TimeMetadata {
  courseLen: number;
  id: number;
  name: string;
  sameBreakLen: boolean;
  sameLen: boolean;
  theBreakLen: number;
}

interface TimeEntry {
  endTime: TimeString;
  node: number;
  startTime: TimeString;
  timeTable: number;
}

interface ScheduleMetadata {
  id: number;
  maxWeek: number;
  nodes: number;
  showOtherWeekCourse: boolean;
  showSat: boolean;
  showSun: boolean;
  sundayFirst: boolean;
  startDate: DateString;
  tableName: string;
  timeTable: number;
}

interface CourseEntry {
  courseName: string;
  credit: number;
  id: number;
  note: string;
  tableId: number;
}

interface ClassEntry {
  day: number;
  endWeek: number;
  id: number;
  level: number;
  ownTime: boolean;
  room: string;
  startNode: number;
  startWeek: number;
  step: number;
  tableId: number;
  teacher: string;
  /**
   * - 0: 全周
   * - 1: 单周
   * - 2: 双周
   */
  type: number;
}

//#endregion

//#region Utils

function* pairwise<T>(iterable: Iterable<T>): Generator<[T, T], void, unknown> {
  let prev: T | undefined;
  let hasPrev = false;
  for (const curr of iterable) {
    if (hasPrev) yield [prev!, curr];
    prev = curr;
    hasPrev = true;
  }
}

//#endregion

function parseWakeup(wakeupRaw: string): SharedData {
  const wakeupArr = JSON.parse(`[${wakeupRaw.split("\n").join(",")}]`) as [
    TimeMetadata,
    TimeEntry[],
    ScheduleMetadata,
    CourseEntry[],
    ClassEntry[],
  ];
  const wakeup = {
    timeMetadata: wakeupArr[0],
    timeEntries: wakeupArr[1],
    scheduleMetadata: wakeupArr[2],
    courseEntries: wakeupArr[3],
    classEntries: wakeupArr[4],
  };

  function parseDate(dateStr: DateString): DateArr {
    return dateStr.split("-").map(Number) as DateArr;
  }
  function parseTime(timeStr: TimeString): TimeArr {
    return timeStr.split(":").map(Number) as TimeArr;
  }

  function makeScheduleSettings(): SharedSettings {
    const wMeta = wakeup.scheduleMetadata;
    const name = wMeta.tableName;
    const startDate = parseDate(wMeta.startDate);
    const currentYear = new Date().getFullYear();
    if (startDate[0] < currentYear - 1 || startDate[0] > currentYear + 1) {
      throw new Error(
        `开始日期的年份 ${startDate[0]} 并非近三年，小爱课程表不支持设置。`,
      );
    }
    const totWeeks = wMeta.maxWeek;
    const showWeekends = wMeta.showSat || wMeta.showSun;
    const showOtherWeekCourse = wMeta.showOtherWeekCourse;
    const courseCount = {
      morning: 0,
      afternoon: 0,
      evening: 0,
    };
    const timeTable = wakeup.timeEntries
      .map((entry) => ({
        start: parseTime(entry.startTime),
        end: parseTime(entry.endTime),
        node: entry.node,
      }))
      .filter((entry) => entry.node <= wMeta.nodes);
    for (const entry of timeTable) {
      const [hr] = entry.start;
      if (hr < 12) courseCount.morning++;
      else if (hr < 18) courseCount.afternoon++;
      else courseCount.evening++;
    }
    for (const [prev, curr] of pairwise(timeTable)) {
      if (
        prev.end[0] > curr.start[0] ||
        (prev.end[0] === curr.start[0] && prev.end[1] > curr.start[1])
      ) {
        throw new Error(
          `课程时间表存在重叠: ${prev.node} 节与 ${curr.node} 节。小爱课程表不支持设置重叠的课程时间。`,
        );
      }
    }

    const sundayFirst = wMeta.sundayFirst;
    return {
      name,
      startDate,
      totWeeks,
      showWeekends,
      showOtherWeekCourse,
      courseCount,
      timeTable,
      sundayFirst,
    };
  }

  function makeClassList(): SharedClassEntry[] {
    const courseMap = new Map<number, CourseEntry>();
    const typeMap = ["all", "odd", "even"] as const;
    for (const course of wakeup.courseEntries) courseMap.set(course.id, course);
    return wakeup.classEntries
      .filter((cls) => !cls.ownTime)
      .map((cls) => ({
        name: courseMap.get(cls.id)?.courseName ?? "未知课程",
        day: cls.day,
        weekType: typeMap[cls.type],
        startWeek: cls.startWeek,
        endWeek: cls.endWeek,
        startNode: cls.startNode,
        endNode: cls.startNode + cls.step - 1,
        room: cls.room,
        teacher: cls.teacher,
      }));
  }

  return {
    settings: makeScheduleSettings(),
    classList: makeClassList(),
  };
}

//#region File I/O and Build

function findWakeupFiles() {
  const files = fs.readdirSync(inputDir);
  const wakeupFiles = files.filter((file) => file.endsWith(".wakeup_schedule"));
  if (wakeupFiles.length === 0)
    throw new Error(
      "未找到 .wakeup_schedule 文件，请确保将文件放在 input 文件夹内。",
    );
  return wakeupFiles.map((name) => path.join(inputDir, name));
}

async function buildFile(wakeupFilePath: string) {
  const wakeupRaw = fs.readFileSync(wakeupFilePath, "utf-8");
  let parseResult: SharedData;
  try {
    parseResult = parseWakeup(wakeupRaw);
  } catch (e) {
    console.error(
      chalk.red(`解析文件 ${wakeupFilePath} 失败:\n   ${(e as Error).message}`),
    );
    return;
  }
  const scriptContent = fs.readFileSync(scriptPath, "utf-8");
  const finalContent = scriptContent.replace(
    /__DATA__/g,
    JSON.stringify(parseResult),
  );
  fs.writeFileSync(tempPath, finalContent);
  const filename = path.basename(wakeupFilePath, ".wakeup_schedule");
  const outputPath = path.join(outputDir, `${filename}.js`);
  try {
    await build({
      entryPoints: [tempPath],
      bundle: true,
      format: "iife",
      minify: true,
      outfile: outputPath,
      charset: "utf8",
    });
  } catch (e) {
    console.error(
      chalk.red(`构建文件 ${wakeupFilePath} 失败:\n   ${(e as Error).message}`),
    );
    return;
  }
  if (fs.existsSync(tempPath)) fs.rmSync(tempPath);
  console.log(chalk.green(`成功构建 ${wakeupFilePath} 为 ${outputPath}`));
}
findWakeupFiles().forEach(buildFile);
//#endregion
