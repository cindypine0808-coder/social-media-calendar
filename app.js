const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PHASES = [
  { key: "shooting", label: "Shooting Date" },
  { key: "submission", label: "Submission Date" },
  { key: "publish", label: "Publish Date" },
];

const TODAY = new Date();
const PHASE_ORDER = { publish: 0, submission: 1, shooting: 2 };
const state = {
  year: TODAY.getFullYear(),
  month: TODAY.getMonth(),
  view: "calendar",
  phases: new Set(["shooting", "submission", "publish"]),
  target: "all",
  postTarget: "all",
  status: "all",
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
  return parseDate(isoDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatLong(isoDate) {
  if (!isoDate) return "TBC";
  return parseDate(isoDate).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

function targetClass(target) {
  if (target.includes("Group Class")) return "hyrox";
  if (target.includes("Studio")) return "studio";
  if (target.includes("IP Development") && target.includes("Brand")) return "mixed";
  if (target.includes("IP Development")) return "ip";
  return "brand";
}

function unique(values) {
  return [...new Set(values)];
}

function activePhases() {
  return PHASES.filter((phase) => state.phases.has(phase.key));
}

function filteredPosts() {
  return PLAN.posts.filter((post) => {
    if (state.target !== "all" && post.target !== state.target) return false;
    if (state.postTarget !== "all" && post.postTarget !== state.postTarget) return false;
    if (state.status !== "all" && post.status !== state.status) return false;
    if (!activePhases().some((phase) => post[phase.key])) return false;
    return true;
  });
}

function eventsForPosts(posts) {
  return posts
    .flatMap((post) =>
      activePhases()
        .filter((phase) => post[phase.key])
        .map((phase) => ({
          ...post,
          phase: phase.key,
          phaseLabel: phase.label,
          date: post[phase.key],
        }))
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
        a.number - b.number
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
  fillSelect("filter-target", unique(PLAN.posts.map((post) => post.target).filter(Boolean)));
  fillSelect(
    "filter-post-target",
    unique(PLAN.posts.map((post) => post.postTarget).filter(Boolean))
  );
  fillSelect("filter-status", unique(PLAN.posts.map((post) => post.status).filter(Boolean)));
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
  const shooting = posts.filter((post) => post.shooting).length;
  const inProgress = posts.filter((post) => post.status === "in progress").length;
  document.getElementById("stats").innerHTML = `
    <div class="stat"><b>${posts.length}</b><span>Posts in plan</span></div>
    <div class="stat"><b>${inProgress}</b><span>In progress</span></div>
    <div class="stat"><b>${shooting}</b><span>With shooting date</span></div>
  `;
}

function renderPostList() {
  const list = document.getElementById("post-list");
  const posts = filteredPosts();
  if (!posts.length) {
    list.innerHTML = `<li class="empty">No posts match these filters.</li>`;
    return;
  }

  list.innerHTML = posts
    .map(
      (post) => `
      <li>
        <button type="button" data-id="${post.id}">
          <time>${escapeHtml(String(post.number).padStart(2, "0"))} · ${escapeHtml(post.status)}</time>
          <div class="name">《${escapeHtml(post.title)}》</div>
          <div class="sub"><strong>Target</strong> ${escapeHtml(post.target)}</div>
          <div class="sub"><strong>Post Target</strong> ${escapeHtml(post.postTarget)}</div>
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
    body.innerHTML = `<tr><td colspan="8" class="empty">No posts match these filters.</td></tr>`;
    return;
  }

  body.innerHTML = posts
    .map(
      (post) => `
      <tr data-id="${post.id}" class="clickable-row">
        <td>${escapeHtml(String(post.number))}</td>
        <td class="title-cell">《${escapeHtml(post.title)}》</td>
        <td>${escapeHtml(post.target)}</td>
        <td>${escapeHtml(post.postTarget)}</td>
        <td class="${post.shooting ? "date-shooting" : "muted-cell"}">${escapeHtml(formatShort(post.shooting))}</td>
        <td class="${post.submission ? "date-submission" : "muted-cell"}">${escapeHtml(formatShort(post.submission))}</td>
        <td class="${post.publish ? "date-publish" : "muted-cell"}">${escapeHtml(formatShort(post.publish))}</td>
        <td>${escapeHtml(post.status)}</td>
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
  const label = new Date(state.year, state.month, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
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
                <span class="mark ${targetClass(event.target)}"></span>
                <span>
                  <span class="label">${escapeHtml(event.number)}. ${escapeHtml(event.title)}</span>
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
    list.innerHTML = `<li class="empty">No matching dates this month.</li>`;
    return;
  }

  list.innerHTML = monthEvents
    .map(
      (event) => `
      <li>
        <button type="button" data-id="${event.id}">
          <time>${formatLong(event.date)} · ${escapeHtml(event.phaseLabel)}</time>
          <div class="name">${escapeHtml(event.number)}. 《${escapeHtml(event.title)}》</div>
          <div class="sub">${escapeHtml(event.target)}</div>
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
  return `<div><span>${escapeHtml(label)}</span><b>${value ? formatLong(value) : "TBC / none"}</b></div>`;
}

function openDrawer(postId) {
  const post = PLAN.posts.find((item) => item.id === postId);
  if (!post) return;

  showDrawer(`
    <p class="kicker">Post ${escapeHtml(post.number)} · ${escapeHtml(post.status)}</p>
    <h2>《${escapeHtml(post.title)}》</h2>
    <div class="pills">
      <span class="pill">${escapeHtml(post.status)}</span>
      ${post.priority ? `<span class="pill ${post.priority.toLowerCase()}">${escapeHtml(post.priority)}</span>` : ""}
      <span class="pill">${escapeHtml(post.target)}</span>
    </div>
    <div class="timeline">
      <div><span>Target</span><b>${escapeHtml(post.target)}</b></div>
      <div><span>Post Target</span><b>${escapeHtml(post.postTarget)}</b></div>
      <div><span>Title</span><b>《${escapeHtml(post.title)}》</b></div>
      ${dateRow("Shooting Date", post.shooting)}
      ${dateRow("Submission Date", post.submission)}
      ${dateRow("Publish Date", post.publish)}
    </div>
    <p class="remarks">
      <strong>ClickUp content</strong><br />
      ${escapeHtml(post.content)}
      ${
        post.url
          ? `<a href="${escapeHtml(post.url)}" target="_blank" rel="noreferrer">Open in ClickUp</a>`
          : ""
      }
    </p>
  `);
}

function openDay(dateKey) {
  const events = eventsForPosts(filteredPosts()).filter((event) => event.date === dateKey);
  if (!events.length) return;

  showDrawer(`
    <p class="kicker">Day schedule</p>
    <h2>${formatLong(dateKey)}</h2>
    <ol class="agenda">
      ${events
        .map(
          (event) => `
        <li>
          <button type="button" data-id="${event.id}">
            <time>${escapeHtml(event.phaseLabel)}</time>
            <div class="name">${escapeHtml(event.number)}. 《${escapeHtml(event.title)}》</div>
            <div class="sub">${escapeHtml(event.target)} · ${escapeHtml(event.status)}</div>
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

  document.getElementById("filter-target").addEventListener("change", (event) => {
    state.target = event.target.value;
    renderAll();
  });
  document.getElementById("filter-post-target").addEventListener("change", (event) => {
    state.postTarget = event.target.value;
    renderAll();
  });
  document.getElementById("filter-status").addEventListener("change", (event) => {
    state.status = event.target.value;
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
