const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const PHASES = [
  { key: "shooting", label: "拍攝日" },
  { key: "submission", label: "交片日" },
  { key: "publish", label: "發佈日" },
];

const TODAY = new Date();
const PHASE_ORDER = { publish: 0, submission: 1, shooting: 2 };
const STORAGE_KEY = "ssf-calendar-date-overrides-v1";
const SOURCE_POSTS = PLAN.posts.map((post) => ({ ...post }));
const state = {
  year: TODAY.getFullYear(),
  month: TODAY.getMonth(),
  view: "calendar",
  phases: new Set(["shooting", "submission", "publish"]),
  campaigns: new Set(["01", "02", "03"]),
};

let posts = SOURCE_POSTS.map((post) => ({ ...post }));
let lastMove = null;
let skipClick = false;
let toastTimer = 0;

function parseDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function iso(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatShort(isoDate) {
  if (!isoDate) return "TBC";
  return parseDate(isoDate).toLocaleDateString("zh-HK", {
    month: "short",
    day: "numeric",
  });
}

function formatLong(isoDate) {
  if (!isoDate) return "TBC";
  return parseDate(isoDate).toLocaleDateString("zh-HK", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function campaignClass(campaign) {
  if (campaign === "02") return "nsca";
  if (campaign === "03") return "jason";
  return "ssf";
}

function postLabel(post) {
  return `${post.campaign} R${post.number}`;
}

function phaseLabel(key) {
  return PHASES.find((phase) => phase.key === key)?.label || key;
}

function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function applyOverrides() {
  const overrides = loadOverrides();
  posts = SOURCE_POSTS.map((post) => {
    const extra = overrides[post.id];
    if (!extra) return { ...post };
    return {
      ...post,
      shooting: extra.shooting ?? post.shooting,
      submission: extra.submission ?? post.submission,
      publish: extra.publish ?? post.publish,
    };
  });
}

function overrideCount() {
  return Object.values(loadOverrides()).reduce(
    (count, extra) => count + Object.keys(extra || {}).length,
    0
  );
}

function isEdited(postId, phase) {
  const extra = loadOverrides()[postId];
  return Boolean(extra && Object.prototype.hasOwnProperty.call(extra, phase));
}

function getPost(postId) {
  return posts.find((item) => item.id === postId);
}

function activePhases() {
  return PHASES.filter((phase) => state.phases.has(phase.key));
}

function sortedPosts(list) {
  return [...list].sort((a, b) => {
    const aDate = a.publish || a.submission || a.shooting || "9999-99-99";
    const bDate = b.publish || b.submission || b.shooting || "9999-99-99";
    return aDate.localeCompare(bDate) || a.campaign.localeCompare(b.campaign) || a.number - b.number;
  });
}

function filteredPosts() {
  return sortedPosts(posts).filter((post) => {
    if (!state.campaigns.has(post.campaign)) return false;
    if (!activePhases().some((phase) => post[phase.key])) return false;
    return true;
  });
}

function eventsForPosts(list) {
  return list
    .flatMap((post) =>
      activePhases()
        .filter((phase) => post[phase.key])
        .map((phase) => ({
          ...post,
          phase: phase.key,
          phaseLabel: phase.label,
          date: post[phase.key],
          edited: isEdited(post.id, phase.key),
        }))
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
        a.campaign.localeCompare(b.campaign) ||
        a.number - b.number
    );
}

function eventsForDate(dateKey) {
  return eventsForPosts(filteredPosts()).filter((event) => event.date === dateKey);
}

function updateViewVisibility() {
  const calendarLayout = document.getElementById("calendar-layout");
  const tableLayout = document.getElementById("table-layout");
  const monthNav = document.getElementById("month-nav");
  const isCalendar = state.view === "calendar";

  calendarLayout.hidden = !isCalendar;
  tableLayout.hidden = isCalendar;
  monthNav.hidden = !isCalendar;

  document.querySelectorAll(".view-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function renderAll() {
  updateViewVisibility();
  renderStats();
  renderEditBar();
  renderPostList();
  renderCalendar();
  renderTable();
}

function renderStats() {
  const visible = posts.filter((post) => state.campaigns.has(post.campaign));
  const shooting = visible.filter((post) => post.shooting).length;
  document.getElementById("stats").innerHTML = `
    <div class="stat"><b>${visible.length}</b><span>Reels</span></div>
    <div class="stat"><b>${state.campaigns.size}</b><span>Campaigns</span></div>
    <div class="stat"><b>${shooting}</b><span>有拍攝日</span></div>
  `;
  const local = overrideCount();
  document.getElementById("sync-status").textContent = local
    ? `${PLAN.source} · 這個瀏覽器已改 ${local} 個日子`
    : PLAN.source;
}

function renderEditBar() {
  const count = overrideCount();
  const undoBtn = document.getElementById("undo-move");
  const resetBtn = document.getElementById("reset-dates");
  const downloadBtn = document.getElementById("download-data");
  const copy = document.getElementById("edit-copy");

  undoBtn.hidden = !lastMove;
  resetBtn.hidden = !count;
  downloadBtn.hidden = !count;
  copy.textContent = count
    ? `已在這個瀏覽器改了 ${count} 個日子。拖動色塊可繼續改期；這些改動不會寫回 ClickUp。`
    : "在月曆上把色塊拖到其他日子，即可改拍攝日 / 交片日 / 發佈日。改動只存在這個瀏覽器，不會寫回 ClickUp。";
}

function renderPostList() {
  const list = document.getElementById("post-list");
  const visible = filteredPosts();
  if (!visible.length) {
    list.innerHTML = `<li class="empty">沒有符合篩選的 Reels。</li>`;
    return;
  }

  list.innerHTML = visible
    .map(
      (post) => `
      <li>
        <button type="button" data-id="${post.id}">
          <time>${escapeHtml(postLabel(post))} · ${escapeHtml(post.campaignName)}</time>
          <div class="name">${escapeHtml(post.title)}</div>
          <div class="sub"><strong>發佈</strong> ${escapeHtml(formatShort(post.publish))}</div>
        </button>
      </li>
    `
    )
    .join("");
}

function isCompact() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function renderTable() {
  const body = document.getElementById("posts-table-body");
  const visible = filteredPosts();
  if (!visible.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">沒有符合篩選的 Reels。</td></tr>`;
    return;
  }

  body.innerHTML = visible
    .map(
      (post) => `
      <tr data-id="${post.id}" class="clickable-row">
        <td data-label="Campaign"><span class="pill ${campaignClass(post.campaign)}">${escapeHtml(post.campaign)} ${escapeHtml(post.campaignName)}</span></td>
        <td data-label="Reels">R${escapeHtml(String(post.number))}</td>
        <td data-label="Title" class="title-cell">${escapeHtml(post.title)}</td>
        <td data-label="拍攝日" class="date-shooting${isEdited(post.id, "shooting") ? " edited-date" : ""}">${escapeHtml(formatShort(post.shooting))}</td>
        <td data-label="交片日" class="date-submission${isEdited(post.id, "submission") ? " edited-date" : ""}">${escapeHtml(formatShort(post.submission))}</td>
        <td data-label="發佈日" class="date-publish${isEdited(post.id, "publish") ? " edited-date" : ""}">${escapeHtml(formatShort(post.publish))}</td>
        <td data-label="Status">${escapeHtml(post.status)}</td>
      </tr>
    `
    )
    .join("");
}

function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function renderCalendar() {
  const label = new Date(state.year, state.month, 1).toLocaleDateString("zh-HK", {
    year: "numeric",
    month: "long",
  });
  document.getElementById("month-label").textContent = label;
  document.getElementById("weekdays").innerHTML = WEEKDAYS.map(
    (day) => `<span>${day}</span>`
  ).join("");

  const events = eventsForPosts(filteredPosts());
  const byDate = events.reduce((map, event) => {
    map[event.date] ??= [];
    map[event.date].push(event);
    return map;
  }, {});

  document.getElementById("calendar").innerHTML = monthGrid(state.year, state.month)
    .map((date) => {
      const key = iso(date);
      const outside = date.getMonth() !== state.month;
      const isToday = key === iso(TODAY);
      const dayEvents = byDate[key] || [];
      const compact = isCompact();
      const visible = compact ? dayEvents.slice(0, 2) : dayEvents;
      const overflow = dayEvents.length - visible.length;
      return `
        <article class="day${outside ? " outside" : ""}${isToday ? " today" : ""}${dayEvents.length ? " has-events" : ""}" data-date="${key}">
          <div class="date-num">
            <span>${date.getDate()}</span>
            ${isToday ? "<span class=\"today-tag\">Today</span>" : ""}
            ${compact && dayEvents.length ? `<span class="day-count">${dayEvents.length}</span>` : ""}
          </div>
          <div class="events">
            ${visible
              .map(
                (event) => `
              <button class="chip ${event.phase}${event.edited ? " edited" : ""}" data-id="${event.id}" data-phase="${event.phase}" data-date="${event.date}" type="button" draggable="true">
                <span class="mark ${campaignClass(event.campaign)}"></span>
                <span>
                  <span class="label">
                    <span class="label-short">${escapeHtml(postLabel(event))}</span>
                    <span class="label-full">${escapeHtml(postLabel(event))} ${escapeHtml(event.title)}</span>
                  </span>
                  <span class="meta">${escapeHtml(event.phaseLabel)}${event.edited ? " · 已改" : ""}</span>
                </span>
              </button>
            `
              )
              .join("")}
            ${
              overflow > 0
                ? `<button class="more" data-date="${key}" type="button">+${overflow} more</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");

  renderAgenda(events);
}

function renderAgenda(events) {
  const monthEvents = events.filter((event) => {
    const date = parseDate(event.date);
    return date.getFullYear() === state.year && date.getMonth() === state.month;
  });

  const list = document.getElementById("agenda");
  if (!monthEvents.length) {
    list.innerHTML = `<li class="empty">這個月沒有對應日期。</li>`;
    return;
  }

  list.innerHTML = monthEvents
    .map(
      (event) => `
      <li>
        <button type="button" data-id="${event.id}">
          <time><i class="dot ${event.phase}"></i>${formatLong(event.date)} · ${escapeHtml(event.phaseLabel)}${event.edited ? " · 已改" : ""}</time>
          <div class="name">${escapeHtml(postLabel(event))} · ${escapeHtml(event.title)}</div>
          <div class="sub">${escapeHtml(event.campaignName)}</div>
        </button>
      </li>
    `
    )
    .join("");
}

function showDrawer(html) {
  document.getElementById("drawer-body").innerHTML = html;
  document.getElementById("drawer").hidden = false;
  document.getElementById("backdrop").hidden = false;
}

function dateRow(label, value) {
  return `<div><span>${escapeHtml(label)}</span><b>${value ? formatLong(value) : "TBC"}</b></div>`;
}

function openDrawer(postId) {
  const post = getPost(postId);
  if (!post) return;

  showDrawer(`
    <p class="kicker">Campaign ${escapeHtml(post.campaign)} · R${escapeHtml(String(post.number))}</p>
    <h2>${escapeHtml(post.title)}</h2>
    <div class="pills">
      <span class="pill ${campaignClass(post.campaign)}">${escapeHtml(post.campaignName)}</span>
      <span class="pill">${escapeHtml(post.status)}</span>
    </div>
    <div class="timeline">
      ${post.purpose ? `<div><span>目的</span><b>${escapeHtml(post.purpose)}</b></div>` : ""}
      ${post.hook ? `<div><span>Hook</span><b>${escapeHtml(post.hook)}</b></div>` : ""}
      ${dateRow("拍攝日", post.shooting)}
      ${dateRow("交片日", post.submission)}
      ${dateRow("發佈日", post.publish)}
    </div>
    ${post.note ? `<p class="remarks">${escapeHtml(post.note)}</p>` : ""}
    <p class="remarks"><a href="${escapeHtml(post.url)}" target="_blank" rel="noreferrer">Open in ClickUp</a></p>
  `);
}

function openDay(dateKey) {
  const events = eventsForDate(dateKey);
  if (!events.length) return;

  showDrawer(`
    <p class="kicker">當日排程</p>
    <h2>${formatLong(dateKey)}</h2>
    <ol class="agenda">
      ${events
        .map(
          (event) => `
        <li>
          <button type="button" data-id="${event.id}">
            <time><i class="dot ${event.phase}"></i>${escapeHtml(event.phaseLabel)} · Campaign ${escapeHtml(event.campaign)}</time>
            <div class="name">${escapeHtml(postLabel(event))} · ${escapeHtml(event.title)}</div>
            <div class="sub">${escapeHtml(event.campaignName)}</div>
          </button>
        </li>
      `
        )
        .join("")}
    </ol>
  `);
}

function closeDrawer() {
  document.getElementById("drawer").hidden = true;
  document.getElementById("backdrop").hidden = true;
  document.getElementById("drawer-body").innerHTML = "";
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.hidden = false;
  toast.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function moveDate(postId, phase, nextDate, { silent } = {}) {
  const post = getPost(postId);
  const source = SOURCE_POSTS.find((item) => item.id === postId);
  if (!post || !source || !PHASES.some((item) => item.key === phase)) return;
  if (!nextDate || post[phase] === nextDate) return;

  const previous = post[phase];
  const overrides = loadOverrides();
  const extra = { ...(overrides[postId] || {}) };
  if (source[phase] === nextDate) {
    delete extra[phase];
  } else {
    extra[phase] = nextDate;
  }
  if (Object.keys(extra).length) overrides[postId] = extra;
  else delete overrides[postId];
  saveOverrides(overrides);
  lastMove = { postId, phase, from: previous, to: nextDate };
  applyOverrides();
  renderAll();

  if (!silent) {
    const updated = getPost(postId);
    showToast(
      `${postLabel(updated)} ${phaseLabel(phase)} 已改到 ${formatLong(nextDate)}`
    );
  }
}

function undoMove() {
  if (!lastMove) return;
  const { postId, phase, from } = lastMove;
  if (from) moveDate(postId, phase, from, { silent: true });
  lastMove = null;
  renderEditBar();
  showToast("已復原上一步");
}

function resetDates() {
  if (!overrideCount()) return;
  if (!window.confirm("還原這個瀏覽器裡所有已改的日子，回到目前 ClickUp 同步的日期？")) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  lastMove = null;
  applyOverrides();
  renderAll();
  showToast("已還原 ClickUp 日子");
}

function downloadData() {
  const payload = {
    ...PLAN,
    posts,
    source: `${PLAN.source} · local edits ${new Date().toLocaleString("zh-HK")}`,
  };
  const blob = new Blob([`const PLAN = ${JSON.stringify(payload, null, 2)};\n`], {
    type: "text/javascript",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "data.js";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function dayFromPoint(x, y) {
  const stack = document.elementsFromPoint?.(x, y) || [document.elementFromPoint(x, y)];
  for (const node of stack) {
    const day = node?.closest?.(".day[data-date]");
    if (day) return day;
  }
  return null;
}

function highlightDay(x, y) {
  document.querySelectorAll(".day.drop-target").forEach((day) => {
    day.classList.remove("drop-target");
  });
  dayFromPoint(x, y)?.classList.add("drop-target");
}

function clearDayHighlights() {
  document.querySelectorAll(".day.drop-target").forEach((day) => {
    day.classList.remove("drop-target");
  });
}

function payloadFromChip(chip) {
  return {
    id: chip.dataset.id,
    phase: chip.dataset.phase,
    from: chip.dataset.date,
  };
}

function dropOnDay(payload, day) {
  const nextDate = day?.dataset.date;
  if (!payload?.id || !payload?.phase || !nextDate || nextDate === payload.from) return;
  skipClick = true;
  moveDate(payload.id, payload.phase, nextDate);
}

function bindCalendarDrag() {
  const calendar = document.getElementById("calendar");
  let session = null;
  let htmlPayload = null;

  calendar.addEventListener("dragstart", (event) => {
    const chip = event.target.closest(".chip[data-id][data-phase]");
    if (!chip) {
      event.preventDefault();
      return;
    }
    htmlPayload = payloadFromChip(chip);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(htmlPayload));
    chip.classList.add("dragging");
    document.body.classList.add("is-dragging");
    closeDrawer();
    skipClick = true;
  });

  calendar.addEventListener("dragend", () => {
    document.body.classList.remove("is-dragging");
    document.querySelectorAll(".chip.dragging").forEach((chip) => chip.classList.remove("dragging"));
    clearDayHighlights();
    htmlPayload = null;
  });

  calendar.addEventListener("dragover", (event) => {
    const day = event.target.closest(".day[data-date]");
    if (!day) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    highlightDay(event.clientX, event.clientY);
  });

  calendar.addEventListener("dragleave", (event) => {
    if (event.target.closest(".day[data-date]") && !calendar.contains(event.relatedTarget)) {
      clearDayHighlights();
    }
  });

  calendar.addEventListener("drop", (event) => {
    const day = event.target.closest(".day[data-date]");
    if (!day) return;
    event.preventDefault();
    let payload = htmlPayload;
    try {
      payload = JSON.parse(event.dataTransfer.getData("text/plain")) || payload;
    } catch {
      /* keep dragstart payload */
    }
    dropOnDay(payload, day);
  });

  const endSession = (event) => {
    if (!session || event.pointerId !== session.pointerId) return;
    const current = session;
    session = null;
    document.body.classList.remove("is-dragging");
    clearDayHighlights();
    current.ghost?.remove();
    current.chip.classList.remove("dragging");
    try {
      current.chip.releasePointerCapture(current.pointerId);
    } catch {
      /* already released */
    }
    if (!current.started) return;
    dropOnDay(
      { id: current.id, phase: current.phase, from: current.from },
      dayFromPoint(event.clientX, event.clientY)
    );
  };

  calendar.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || event.button !== 0) return;
    const chip = event.target.closest(".chip[data-id][data-phase]");
    if (!chip) return;
    session = {
      pointerId: event.pointerId,
      chip,
      id: chip.dataset.id,
      phase: chip.dataset.phase,
      from: chip.dataset.date,
      x: event.clientX,
      y: event.clientY,
      started: false,
      ghost: null,
    };
  });

  window.addEventListener(
    "pointermove",
    (event) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const distance = Math.hypot(event.clientX - session.x, event.clientY - session.y);
      if (!session.started) {
        if (distance < 8) return;
        session.started = true;
        closeDrawer();
        session.chip.classList.add("dragging");
        document.body.classList.add("is-dragging");
        session.chip.setPointerCapture(session.pointerId);
        const ghost = session.chip.cloneNode(true);
        ghost.classList.add("chip-ghost");
        ghost.removeAttribute("draggable");
        ghost.style.width = `${session.chip.offsetWidth}px`;
        document.body.appendChild(ghost);
        session.ghost = ghost;
      }
      event.preventDefault();
      session.ghost.style.transform = `translate(${event.clientX + 10}px, ${event.clientY + 10}px)`;
      highlightDay(event.clientX, event.clientY);
    },
    { passive: false }
  );

  window.addEventListener("pointerup", endSession);
  window.addEventListener("pointercancel", endSession);
}

function bind() {
  document.getElementById("prev-month").addEventListener("click", () => {
    const date = new Date(state.year, state.month - 1, 1);
    state.year = date.getFullYear();
    state.month = date.getMonth();
    renderCalendar();
  });
  document.getElementById("next-month").addEventListener("click", () => {
    const date = new Date(state.year, state.month + 1, 1);
    state.year = date.getFullYear();
    state.month = date.getMonth();
    renderCalendar();
  });
  document.getElementById("today").addEventListener("click", () => {
    state.year = TODAY.getFullYear();
    state.month = TODAY.getMonth();
    renderCalendar();
  });

  document.querySelectorAll(".view-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      renderAll();
    });
  });

  document.querySelectorAll("[data-phase]").forEach((button) => {
    button.addEventListener("click", () => {
      const phase = button.dataset.phase;
      if (state.phases.has(phase)) {
        if (state.phases.size === 1) return;
        state.phases.delete(phase);
        button.classList.remove("active");
      } else {
        state.phases.add(phase);
        button.classList.add("active");
      }
      renderAll();
    });
  });

  document.querySelectorAll("[data-campaign]").forEach((button) => {
    button.addEventListener("click", () => {
      const campaign = button.dataset.campaign;
      if (state.campaigns.has(campaign)) {
        if (state.campaigns.size === 1) return;
        state.campaigns.delete(campaign);
        button.classList.remove("active");
      } else {
        state.campaigns.add(campaign);
        button.classList.add("active");
      }
      renderAll();
    });
  });

  document.getElementById("undo-move").addEventListener("click", undoMove);
  document.getElementById("reset-dates").addEventListener("click", resetDates);
  document.getElementById("download-data").addEventListener("click", downloadData);

  document.addEventListener("click", (event) => {
    if (skipClick) {
      skipClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target.closest(
      "[data-id], [data-date], #drawer-close, #backdrop, .clickable-row"
    );
    if (!target) return;
    if (target.id === "drawer-close" || target.id === "backdrop") {
      closeDrawer();
      return;
    }
    const day = target.closest(".day[data-date]");
    if (day && !target.closest("#drawer") && !target.closest(".chip")) {
      const dateEvents = eventsForDate(day.dataset.date);
      if (dateEvents.length > 1) {
        openDay(day.dataset.date);
        return;
      }
    }
    if (target.dataset.id) {
      openDrawer(target.dataset.id);
      return;
    }
    if (target.classList.contains("clickable-row") && target.dataset.id) {
      openDrawer(target.dataset.id);
      return;
    }
    if (target.dataset.date) {
      openDay(target.dataset.date);
    }
  });

  bindCalendarDrag();

  let compact = isCompact();
  window.addEventListener("resize", () => {
    const next = isCompact();
    if (next === compact) return;
    compact = next;
    renderAll();
  });
}

applyOverrides();
bind();
renderAll();
