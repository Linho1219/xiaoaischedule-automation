type DateArr = [number, number, number];
type TimeArr = [number, number];

interface SharedSettings {
  name: string;
  startDate: DateArr;
  totWeeks: number;
  showWeekends: boolean;
  showOtherWeekCourse: boolean;
  courseCount: {
    morning: number;
    afternoon: number;
    evening: number;
  };
  timeTable: {
    start: TimeArr;
    end: TimeArr;
    node: number;
  }[];
  sundayFirst: boolean;
}

interface SharedClassEntry {
  name: string;
  day: number;
  weekType: "all" | "odd" | "even";
  startWeek: number;
  endWeek: number;
  startNode: number;
  endNode: number;
  room: string;
  teacher: string;
}

interface SharedData {
  settings: SharedSettings;
  classList: SharedClassEntry[];
}

declare const __DATA__: SharedData;