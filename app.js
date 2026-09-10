const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const PHASES = [
  { key: "submission", label: "交片日" },
  { key: "publish", label: "發佈日" },
  { key: "class", label: "上課日" },
];

const TODAY = new Date();
const PHASE_ORDER = { publish: 0, submission: 1, class: 2 };
const state = {
  year: TODAY.getFullYear(),
  month: TODAY.getMonth(),
  view: "calendar",
  phases: new Set(["submission", "publish", "class"]),
  stage: "all",
};

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

function stageClass(stageKey) {
  if (stageKey === "authority") return "authority";
  if (stageKey === "urgency") return "urgency";
  if (stageKey === "proof") return "proof";
  if (stageKey === "class") return "class";
  return "awareness";
}

function unique(values) {
  return [...new Set(values)];
}

function activePhases() {
  return PHASES.filter((phase) => state.phases.has(phase.key));
}

function sortedPosts(posts) {
  return [...posts].sort(
    (a, b) => a.publish.localeCompare(b.publish) || a.number - b.number
  );
}

function filteredPosts() {
  return sortedPosts(PLAN.posts).filter((post) => {
    if (state.stage !== "all" && post.stage !== state.stage) return false;
    if (!activePhases().some((phase) => post[phase.key])) return false;
    return true;
  });
}

function milestoneEvents() {
  if (!state.phases.has("class")) return [];
  return (PLAN.milestones || []).map((item) => ({
    ...item,
    number: "",
    stage: "上課日",
    stageKey: "class",
    stageName: item.title,
    phase: "class",
    phaseLabel: "上課日",
    isMilestone: true,
  }));
}

function eventsForPosts(posts) {
  const postEvents = posts
    .flatMap((post) =>
      activePhases()
        .filter((phase) => post[phase.key])
        .map((phase) => ({
          ...post,
          phase: phase.key,
          phaseLabel: phase.label,
          date: post[phase.key],
          isMilestone: false,
        }))
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
        a.number - b.number
    );

  return [...postEvents, ...milestoneEvents()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
      (a.number || 0) - (b.number || 0)
  );
}

function fillSelect(id, values) {
  const select = document.getElementById(id);
  const current = select.value;
  const keep = select.querySelector("option");
  select.innerHTML = "";
  select.appendChild(keep);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function populateFilters() {
  fillSelect(
    "filter-stage",
    unique(PLAN.posts.map((post) => post.stage).filter(Boolean))
  );
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
  populateFilters();
  updateViewVisibility();
  renderStats();
  renderPostList();
  renderCalendar();
  renderTable();
}

function renderStats() {
  const posts = PLAN.posts;
  const firstPublish = sortedPosts(posts)[0]?.publish;
  document.getElementById("stats").innerHTML = `
    <div class="stat"><b>${posts.length}</b><span>Reels</span></div>
    <div class="stat"><b>4</b><span>階段</span></div>
    <div class="stat"><b>${escapeHtml(formatShort(PLAN.courseStart))}</b><span>上課日</span></div>
  `;
  document.getElementById("sync-status").textContent =
    `${PLAN.source} · 首發 ${formatShort(firstPublish)}`;
}

function renderPostList() {
  const list = document.getElementById("post-list");
  const posts = filteredPosts();
  if (!posts.length) {
    list.innerHTML = `<li class="empty">沒有符合篩選的 Reels。</li>`;
    return;
  }

  list.innerHTML = posts
    .map(
      (post) => `
      <li>
        <button type="button" data-id="${post.id}">
          <time>Reels ${escapeHtml(String(post.number))} · ${escapeHtml(post.stage)}</time>
          <div class="name">${escapeHtml(post.title)}</div>
          <div class="sub"><strong>發佈</strong> ${escapeHtml(formatShort(post.publish))}</div>
        </button>
      </li>
    `
    )
    .join("");
}

function renderTable() {
  const body = document.getElementById("posts-table-body");
  const posts = filteredPosts();
  if (!posts.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">沒有符合篩選的 Reels。</td></tr>`;
    return;
  }

  body.innerHTML = posts
    .map(
      (post) => `
      <tr data-id="${post.id}" class="clickable-row">
        <td>${escapeHtml(String(post.number))}</td>
        <td class="title-cell">${escapeHtml(post.title)}</td>
        <td>${escapeHtml(post.stage)} · ${escapeHtml(post.stageEn)}</td>
        <td class="date-submission">${escapeHtml(formatShort(post.submission))}</td>
        <td class="date-publish">${escapeHtml(formatShort(post.publish))}</td>
        <td class="hook-cell">${escapeHtml(post.hook)}</td>
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
      const visible = dayEvents.slice(0, 3);
      const overflow = dayEvents.length - visible.length;
      return `
        <article class="day${outside ? " outside" : ""}${isToday ? " today" : ""}">
          <div class="date-num">
            <span>${date.getDate()}</span>
            ${isToday ? "<span>Today</span>" : ""}
          </div>
          <div class="events">
            ${visible
              .map(
                (event) => `
              <button class="chip ${event.phase}" data-id="${event.id}" type="button">
                <span class="mark ${stageClass(event.stageKey)}"></span>
                <span>
                  <span class="label">${
                    event.isMilestone
                      ? escapeHtml(event.title)
                      : `R${escapeHtml(String(event.number))} ${escapeHtml(event.title)}`
                  }</span>
                  <span class="meta">${escapeHtml(event.phaseLabel)}</span>
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
          <time>${formatLong(event.date)} · ${escapeHtml(event.phaseLabel)}</time>
          <div class="name">${
            event.isMilestone
              ? escapeHtml(event.title)
              : `Reels ${escapeHtml(String(event.number))} · ${escapeHtml(event.title)}`
          }</div>
          <div class="sub">${escapeHtml(event.stageName || event.stage)}</div>
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

function openMilestone(id) {
  const item = (PLAN.milestones || []).find((entry) => entry.id === id);
  if (!item) return;

  showDrawer(`
    <p class="kicker">Milestone</p>
    <h2>${escapeHtml(item.title)}</h2>
    <div class="pills">
      <span class="pill">上課日</span>
    </div>
    <div class="timeline">
      ${dateRow("日期", item.date)}
    </div>
    <p class="remarks">${escapeHtml(item.note)}</p>
  `);
}

function openDrawer(postId) {
  const milestone = (PLAN.milestones || []).find((item) => item.id === postId);
  if (milestone) {
    openMilestone(postId);
    return;
  }

  const post = PLAN.posts.find((item) => item.id === postId);
  if (!post) return;

  showDrawer(`
    <p class="kicker">Reels ${escapeHtml(String(post.number))} · ${escapeHtml(post.stage)}</p>
    <h2>${escapeHtml(post.title)}</h2>
    <div class="pills">
      <span class="pill">${escapeHtml(post.stage)}</span>
      <span class="pill">${escapeHtml(post.stageEn)}</span>
    </div>
    <div class="timeline">
      <div><span>階段</span><b>${escapeHtml(post.stageName)}</b></div>
      <div><span>方向性目標</span><b>${escapeHtml(post.target)}</b></div>
      <div><span>主要目的</span><b>${escapeHtml(post.purpose)}</b></div>
      <div><span>Hook</span><b>${escapeHtml(post.hook)}</b></div>
      ${dateRow("交片日", post.submission)}
      ${dateRow("發佈日", post.publish)}
    </div>
  `);
}

function openDay(dateKey) {
  const events = eventsForPosts(filteredPosts()).filter((event) => event.date === dateKey);
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
            <time>${escapeHtml(event.phaseLabel)}</time>
            <div class="name">${
              event.isMilestone
                ? escapeHtml(event.title)
                : `Reels ${escapeHtml(String(event.number))} · ${escapeHtml(event.title)}`
            }</div>
            <div class="sub">${escapeHtml(event.stageName || event.stage)}</div>
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

  document.querySelectorAll(".date-toggle").forEach((button) => {
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

  document.getElementById("filter-stage").addEventListener("change", (event) => {
    state.stage = event.target.value;
    renderAll();
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest(
      "[data-id], [data-date], #drawer-close, #backdrop, .clickable-row"
    );
    if (!target) return;
    if (target.id === "drawer-close" || target.id === "backdrop") {
      closeDrawer();
      return;
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
}

bind();
renderAll();
