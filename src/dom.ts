const data = __DATA__;

const GLOBAL_DELAY = 1500;

//#region Utils

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function fillEl(input: Element, value: string) {
  const proto =
    input.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("Unable to find value setter for input element");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickEl(el: Element) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function waitDialogGone() {
  await select("#modals:empty");
}

async function dismissDialog(buttonText: string) {
  clickEl(
    await select(
      `[aria-label="弹窗"] [role="button"][aria-label="${buttonText}"]`,
    ),
  );
}

function select(
  selector: string,
  timeout = 5000,
  interval = 100,
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const intervalHandle = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(intervalHandle);
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(intervalHandle);
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }
    }, interval);
  });
}

function viewSettings() {
  window.location.hash = "/setting";
}

function viewHome() {
  window.location.hash = "/home";
}

const PICKER_SELECT =
  '[class^="picker"][aria-label="选择列表，双指滑动以选择"]';

//#endregion

async function createNewSchedule(name: string) {
  viewSettings();
  clickEl(await select('[aria-label^="开始新学期"]'));
  await dismissDialog("继续");
  fillEl(
    await select('[aria-label="弹窗"] input[placeholder="课表名称"]'),
    name,
  );
  await dismissDialog("确定");
  await waitDialogGone();
  await sleep(GLOBAL_DELAY);
}

async function selectPicker(picker: Element, value: string) {
  const items = picker.querySelectorAll('[class^="a11yItem"]');
  for (const item of items) {
    if (item.textContent.trim() === value) {
      clickEl(item);
      return;
    }
  }
  throw new Error(`Value "${value}" not found in picker ${picker}`);
}

async function applySettings() {
  viewSettings();

  // 开始上课时间
  clickEl(await select('[aria-label^="开始上课时间"]'));
  await select(PICKER_SELECT);
  const startDatePickers = document.querySelectorAll(PICKER_SELECT);
  if (startDatePickers.length < 3)
    throw new Error("Start date pickers not found");
  await selectPicker(
    startDatePickers[0],
    data.settings.startDate[0].toString(),
  );
  await selectPicker(startDatePickers[1], `${data.settings.startDate[1]}月`);
  await selectPicker(startDatePickers[2], `${data.settings.startDate[2]}日`);
  await dismissDialog("确定");
  await waitDialogGone();
  await sleep(GLOBAL_DELAY);

  // 本学期总周数
  clickEl(await select('[aria-label^="本学期总周数"]'));
  await selectPicker(
    await select(PICKER_SELECT),
    data.settings.totWeeks.toString(),
  );
  await dismissDialog("确定");
  await waitDialogGone();
  await sleep(GLOBAL_DELAY);

  // 课表节数设置
  clickEl(await select('[aria-label^="课表节数设置"]'));
  await select(PICKER_SELECT);
  const courseCountPickers = document.querySelectorAll(PICKER_SELECT);
  if (courseCountPickers.length < 3)
    throw new Error("Course count pickers not found");
  await selectPicker(
    courseCountPickers[0],
    data.settings.courseCount.morning.toString(),
  );
  await selectPicker(
    courseCountPickers[1],
    data.settings.courseCount.afternoon.toString(),
  );
  await selectPicker(
    courseCountPickers[2],
    data.settings.courseCount.evening.toString(),
  );
  await dismissDialog("确定");
  await waitDialogGone();
  await sleep(GLOBAL_DELAY);

  // 课表时间设置
  clickEl(await select('[aria-label^="课表时间设置"]'));
  const timeListFirstEl = await select('[aria-label^="第一节"]');
  if (!timeListFirstEl) throw new Error("Time list not found");
  const timeListEls = document.querySelectorAll(
    '[aria-label*="第"][aria-label*="节"]',
  );
  console.log("Time list elements:", timeListEls);
  for (const [index, timeListEl] of timeListEls.entries()) {
    const timeEntry = data.settings.timeTable[index];
    if (!timeEntry) break;
    clickEl(timeListEl);
    await select(PICKER_SELECT);
    const timePickers = document.querySelectorAll(PICKER_SELECT);
    if (timePickers.length < 4) throw new Error("Time pickers not found");
    await selectPicker(
      timePickers[0],
      timeEntry.start[0].toString().padStart(2, "0"),
    );
    await selectPicker(
      timePickers[1],
      timeEntry.start[1].toString().padStart(2, "0"),
    );
    await selectPicker(
      timePickers[2],
      timeEntry.end[0].toString().padStart(2, "0"),
    );
    await selectPicker(
      timePickers[3],
      timeEntry.end[1].toString().padStart(2, "0"),
    );

    await dismissDialog("确定");
    await waitDialogGone();
  }
  clickEl(await select("i.icon-confirm.iconfont.ai-icon.ai-icon-xs"));

  await select('[aria-label^="开始上课时间"]');
  await sleep(GLOBAL_DELAY);
}

async function applyClass() {
  viewHome();
  data.classList.sort((a, b) => a.day - b.day || a.startNode - b.startNode);
  for (const entry of data.classList) {
    await select('[aria-label="切换课表"]');
    const dayBoxRect = document
      .querySelector(`[class^="dateItem___"]:nth-child(${entry.day})`)
      ?.getBoundingClientRect();
    if (!dayBoxRect) throw new Error("Day box not found");
    const emptyBox = [
      ...document.querySelectorAll('[class^="cellItem___"]:empty'),
    ].find((box) => {
      const boxRect = box.getBoundingClientRect();
      return (
        boxRect.x > dayBoxRect.x && boxRect.x < dayBoxRect.x + dayBoxRect.width
      );
    });
    if (!emptyBox) throw new Error("Empty box not found for class entry");
    clickEl(emptyBox);
    clickEl(await select('[aria-label="添加课程"]'));
    await select('[aria-label="编辑课程"]');
    fillEl(await select('[aria-label^="课程名称输"] textarea'), entry.name);
    if (entry.room)
      fillEl(await select('[aria-label^="教室输"] textarea'), entry.room);
    if (entry.teacher)
      fillEl(await select('[aria-label^="老师输"] textarea'), entry.teacher);
    clickEl(await select('[aria-label^="上课时间"]'));
    await select(PICKER_SELECT);
    const nodePickers = document.querySelectorAll(PICKER_SELECT);
    if (nodePickers.length < 2) throw new Error("Node pickers not found");
    await selectPicker(nodePickers[0], entry.startNode.toString());
    await selectPicker(nodePickers[1], entry.endNode.toString());
    await dismissDialog("确定");
    await waitDialogGone();

    const weekTypeArialLabel = (
      {
        all: "全选",
        odd: "单周",
        even: "双周",
      } as const
    )[entry.weekType];
    const weekTypeItem = await select(`[aria-label^="${weekTypeArialLabel}"]`);
    if (!weekTypeItem) throw new Error("Week type item not found");
    if (weekTypeItem.ariaLabel?.includes("未选中")) clickEl(weekTypeItem);

    const weekItems = document.querySelectorAll(
      '[aria-label^="第"][aria-label*="周，"]',
    );
    if (entry.startWeek !== 1)
      for (let i = 0; i < entry.startWeek - 1; i++) {
        const item = weekItems[i];
        if (item.ariaLabel?.includes("已选中")) clickEl(item);
      }
    if (entry.endWeek !== data.settings.totWeeks)
      for (let i = entry.endWeek; i < data.settings.totWeeks; i++) {
        const item = weekItems[i];
        if (item.ariaLabel?.includes("已选中")) clickEl(item);
      }
    clickEl(await select("i.icon-confirm.iconfont.ai-icon.ai-icon-xs"));
    await sleep(GLOBAL_DELAY);
  }
}

(async () => {
  await createNewSchedule(data.settings.name);
  await applySettings();
  await applyClass();
})();
