
/* =========================================
   ATTENDIFY - FULL DYNAMIC APPLICATION
   Connected to Node.js REST API
========================================= */

const API = "/api";

let students = [];
let attendance = [];
let historyData = [];
let reportData = [];

let currentDate = getLocalDate();
let editingStudentId = null;

// =========================================
// HELPERS
// =========================================

function getLocalDate() {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000)
        .toISOString().slice(0, 10);
}

function getCurrentMonth() {
    return currentDate.slice(0, 7);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");

    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong");
    }

    return data;
}

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

// =========================================
// INITIALIZATION
// =========================================

document.addEventListener("DOMContentLoaded", async () => {

    document.getElementById("attendanceDate").value = currentDate;
    document.getElementById("reportMonth").value = getCurrentMonth();
    document.getElementById("todayDate").textContent =
        new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });

    initializeNavigation();
    initializeEvents();
    refreshIcons();

    await loadAllData();

});

// =========================================
// LOAD ALL DATA
// =========================================

async function loadAllData() {

    try {

        setText("systemStatus", "Connecting...");

        await loadStudents();
        await loadAttendance();
        await loadHistory();
        await loadReports();

        updateDashboard();

        const status = document.getElementById("systemStatus");

        status.innerHTML =
            '<span class="live-dot"></span> System online';

    } catch (error) {

        console.error(error);

        const status = document.getElementById("systemStatus");

        status.textContent = "Server offline";

        showToast(error.message, "error");

    }

}

// =========================================
// STUDENT MANAGEMENT
// =========================================

async function loadStudents() {

    students = await apiRequest("/students");

    renderStudents();
    renderAttendanceTable();

    setText(
        "studentCountLabel",
        `${students.length} registered students`
    );

}

function renderStudents() {

    const tbody = document.getElementById("studentsTableBody");

    if (!students.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    No students registered. Add your first student.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = students.map(student => `
        <tr>
            <td><strong>${escapeHTML(student.rollNo)}</strong></td>
            <td>${escapeHTML(student.name)}</td>
            <td>${escapeHTML(student.course)}</td>
            <td>${escapeHTML(student.year)}</td>
            <td>${escapeHTML(student.email || "-")}</td>
            <td>
                <div class="row-actions">

                    <button class="row-action"
                        data-action="edit"
                        data-id="${escapeHTML(student.id)}"
                        title="Edit">
                        <i data-lucide="pencil"></i>
                    </button>

                    <button class="row-action delete"
                        data-action="delete"
                        data-id="${escapeHTML(student.id)}"
                        title="Delete">
                        <i data-lucide="trash-2"></i>
                    </button>

                </div>
            </td>
        </tr>
    `).join("");

    refreshIcons();

}

// =========================================
// STUDENT FORM
// =========================================

function openStudentForm(student = null) {

    const panel = document.getElementById("studentFormPanel");
    const form = document.getElementById("studentForm");

    form.reset();

    editingStudentId = student ? student.id : null;

    document.getElementById("studentFormTitle").textContent =
        student ? "Update Student" : "Add New Student";

    document.getElementById("studentSubmit").textContent =
        student ? "Update Student" : "Save Student";

    document.getElementById("studentId").value =
        student?.id || "";

    document.getElementById("rollNo").value =
        student?.rollNo || "";

    document.getElementById("studentName").value =
        student?.name || "";

    document.getElementById("studentCourse").value =
        student?.course || "CSE";

    document.getElementById("studentYear").value =
        student?.year || "2026";

    document.getElementById("studentEmail").value =
        student?.email || "";

    panel.classList.remove("hidden");

    panel.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

}

function closeStudentForm() {

    document.getElementById("studentFormPanel")
        .classList.add("hidden");

    document.getElementById("studentForm").reset();

    editingStudentId = null;

}

async function saveStudent(event) {

    event.preventDefault();

    const student = {

        rollNo: document.getElementById("rollNo").value.trim(),

        name: document.getElementById("studentName").value.trim(),

        course: document.getElementById("studentCourse").value.trim(),

        year: document.getElementById("studentYear").value.trim(),

        email: document.getElementById("studentEmail").value.trim()

    };

    try {

        if (editingStudentId) {

            await apiRequest(`/students/${editingStudentId}`, {
                method: "PUT",
                body: JSON.stringify(student)
            });

            showToast("Student updated successfully!");

        } else {

            await apiRequest("/students", {
                method: "POST",
                body: JSON.stringify(student)
            });

            showToast("Student added successfully!");

        }

        closeStudentForm();

        await loadStudents();
        await loadReports();
        updateDashboard();

    } catch (error) {

        showToast(error.message, "error");

    }

}

async function deleteStudent(id) {

    const student = students.find(s => s.id === id);

    if (!student) return;

    if (!confirm(`Delete ${student.name} from the student list?`)) {
        return;
    }

    try {

        await apiRequest(`/students/${id}`, {
            method: "DELETE"
        });

        showToast("Student deleted successfully!");

        await loadAllData();

    } catch (error) {

        showToast(error.message, "error");

    }

}

// =========================================
// ATTENDANCE MANAGEMENT
// =========================================

function getAttendanceStudent(studentId) {

    return attendance.find(
        item => item.studentId === studentId
    );

}

function getPeriods(studentId) {

    const record = getAttendanceStudent(studentId);

    return record
        ? [...record.periods]
        : Array(7).fill(null);

}

function renderAttendanceTable() {

    const tbody = document.getElementById("attendanceTableBody");

    if (!tbody) return;

    if (!students.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-cell">
                    Please add students first.
                </td>
            </tr>
        `;

        return;

    }

    tbody.innerHTML = students.map(student => {

        const periods = getPeriods(student.id);

        const present = periods.filter(p => p === "P").length;

        return `
            <tr>

                <td><strong>${escapeHTML(student.rollNo)}</strong></td>

                <td class="student-name">
                    ${escapeHTML(student.name)}
                </td>

                ${periods.map((status, index) => `
                    <td>
                        <button
                            class="attendance-btn ${
                                status === "P" ? "present" :
                                status === "A" ? "absent" :
                                "unmarked"
                            }"
                            data-action="toggle"
                            data-id="${escapeHTML(student.id)}"
                            data-period="${index}"
                            title="Click to change status">

                            ${status || "-"}

                        </button>
                    </td>
                `).join("")}

                <td>
                    <strong>${present}/7</strong>
                </td>

            </tr>
        `;

    }).join("");

    updateAttendanceSummary();

}

async function loadAttendance() {

    const data = await apiRequest(
        `/attendance?date=${encodeURIComponent(currentDate)}`
    );

    attendance = data.students || [];

    renderAttendanceTable();
    updateDashboard();

}

function toggleAttendance(studentId, periodIndex) {

    const existing = attendance.find(
        item => item.studentId === studentId
    );

    if (!existing) {

        attendance.push({
            studentId,
            periods: Array(7).fill(null)
        });

    }

    const record = attendance.find(
        item => item.studentId === studentId
    );

    const current = record.periods[periodIndex];

    record.periods[periodIndex] =
        current === null ? "P" :
        current === "P" ? "A" : null;

    renderAttendanceTable();
    updateDashboard();

}

function updateAllAttendance(status) {

    attendance = students.map(student => ({
        studentId: student.id,
        periods: Array(7).fill(status)
    }));

    renderAttendanceTable();
    updateDashboard();

}

function updateAttendanceSummary() {

    let present = 0;
    let absent = 0;
    let unmarked = 0;

    attendance.forEach(student => {

        student.periods.forEach(status => {

            if (status === "P") present++;
            else if (status === "A") absent++;
            else unmarked++;

        });

    });

    setText(
        "attendanceSummary",
        `Present: ${present}  |  Absent: ${absent}  |  Unmarked: ${unmarked}`
    );

}

async function saveAttendance() {

    if (!students.length) {
        showToast("Add students before marking attendance.", "error");
        return;
    }

    try {

        const payload = {
            date: currentDate,

            students: students.map(student => ({
                studentId: student.id,
                periods: getPeriods(student.id)
            }))
        };

        const result = await apiRequest("/attendance", {
            method: "PUT",
            body: JSON.stringify(payload)
        });

        attendance = result.record.students;

        showToast("Attendance saved successfully!");

        await loadHistory();
        await loadReports();

        updateDashboard();

    } catch (error) {

        showToast(error.message, "error");

    }

}

// =========================================
// DASHBOARD
// =========================================

function updateDashboard() {

    setText("totalStudents", students.length);

    let present = 0;
    let absent = 0;
    let unmarked = 0;

    attendance.forEach(student => {

        student.periods.forEach(status => {

            if (status === "P") present++;
            else if (status === "A") absent++;
            else unmarked++;

        });

    });

    const total = present + absent;

    const percentage = total
        ? ((present / total) * 100).toFixed(1)
        : 0;

    setText("presentCount", present);
    setText("absentCount", absent);
    setText("attendancePercentage", percentage + "%");

    renderOverviewChart();
    renderDashboardHistory();

}

function renderOverviewChart() {

    const container = document.getElementById("overviewChart");

    container.innerHTML = "";

    for (let i = 0; i < 7; i++) {

        let present = 0;
        let absent = 0;
        let unmarked = 0;

        attendance.forEach(student => {

            if (student.periods[i] === "P") present++;
            else if (student.periods[i] === "A") absent++;
            else unmarked++;

        });

        const total = Math.max(students.length, 1);

        const presentHeight = present / total * 100;
        const absentHeight = absent / total * 100;
        const unmarkedHeight = unmarked / total * 100;

        container.innerHTML += `
            <div class="chart-column">

                <strong>${present}/${students.length}</strong>

                <div class="chart-bar">

                    <div class="bar-present"
                        style="height:${presentHeight}%">
                    </div>

                    <div class="bar-absent"
                        style="height:${absentHeight}%">
                    </div>

                    <div style="height:${unmarkedHeight}%;background:#dfe2eb">
                    </div>

                </div>

                <small>P${i + 1}</small>

            </div>
        `;

    }

}

function renderDashboardHistory() {

    const tbody = document.getElementById("dashboardHistory");

    const recent = historyData.slice(0, 5);

    if (!recent.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-cell">
                    No saved attendance records.
                </td>
            </tr>
        `;

        return;

    }

    tbody.innerHTML = recent.map(item => `
        <tr>
            <td>${escapeHTML(item.date)}</td>
            <td>${item.present}</td>
            <td>${item.absent}</td>
            <td>
                <span class="status-badge ${
                    item.percentage >= 75 ? "good" : "low"
                }">
                    ${item.percentage}%
                </span>
            </td>
        </tr>
    `).join("");

}

// =========================================
// HISTORY
// =========================================

async function loadHistory() {

    historyData = await apiRequest("/history");

    renderHistory();
    renderDashboardHistory();

}

function renderHistory() {

    const tbody = document.getElementById("historyTableBody");

    if (!historyData.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-cell">
                    No attendance history available.
                </td>
            </tr>
        `;

        return;

    }

    tbody.innerHTML = historyData.map(item => `
        <tr>
            <td><strong>${escapeHTML(item.date)}</strong></td>
            <td>${item.present}</td>
            <td>${item.absent}</td>
            <td>${item.total}</td>
            <td>
                <span class="status-badge ${
                    item.percentage >= 75 ? "good" : "low"
                }">
                    ${item.percentage}%
                </span>
            </td>
        </tr>
    `).join("");

}

// =========================================
// MONTHLY REPORTS
// =========================================

async function loadReports() {

    const month = document.getElementById("reportMonth").value;

    if (!month) return;

    reportData = await apiRequest(
        `/reports?month=${encodeURIComponent(month)}`
    );

    renderReports();

}

function renderReports() {

    const tbody = document.getElementById("monthlyReportBody");

    if (!reportData.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-cell">
                    No students available.
                </td>
            </tr>
        `;

        return;

    }

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalPercentageSum = 0;
    let studentsWithRecords = 0;
    let lowCount = 0;

    reportData.forEach(student => {

        totalPresent += student.present;
        totalAbsent += student.absent;

        if (student.total > 0) {

            totalPercentageSum += student.percentage;
            studentsWithRecords++;

            if (student.percentage < 75) lowCount++;

        }

    });

    const average = studentsWithRecords
        ? (totalPercentageSum / studentsWithRecords).toFixed(1)
        : 0;

    setText("reportPresent", totalPresent);
    setText("reportAbsent", totalAbsent);
    setText("reportAverage", average + "%");
    setText("reportLow", lowCount);

    tbody.innerHTML = reportData.map(student => {

        const good = student.percentage >= 75;

        return `
            <tr>

                <td>${escapeHTML(student.rollNo)}</td>

                <td>${escapeHTML(student.name)}</td>

                <td>${student.present}</td>

                <td>${student.absent}</td>

                <td>${student.total}</td>

                <td>
                    <strong>${student.percentage}%</strong>

                    <div class="progress-track">
                        <div class="progress-fill"
                            style="width:${Math.min(student.percentage, 100)}%;background:${
                                good ? "#17ad78" : "#e35d70"
                            }">
                        </div>
                    </div>
                </td>

                <td>
                    <span class="status-badge ${good ? "good" : "low"}">
                        ${good ? "Good" : "Below 75%"}
                    </span>
                </td>

            </tr>
        `;

    }).join("");

}

// =========================================
// CSV EXPORT
// =========================================

function exportReport() {

    if (!reportData.length) {
        showToast("No report data to export.", "error");
        return;
    }

    const headers = [
        "Roll Number",
        "Student Name",
        "Course",
        "Year",
        "Present",
        "Absent",
        "Total",
        "Percentage"
    ];

    const rows = reportData.map(student => [
        student.rollNo,
        student.name,
        student.course,
        student.year,
        student.present,
        student.absent,
        student.total,
        student.percentage + "%"
    ]);

    const csv = [headers, ...rows]
        .map(row => row.map(value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(","))
        .join("\r\n");

    const blob = new Blob(
        ["\uFEFF" + csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `attendify-report-${getCurrentMonth()}.csv`;

    link.click();

    URL.revokeObjectURL(url);

    showToast("CSV report downloaded!");

}

// =========================================
// SEARCH STUDENTS
// =========================================

function searchStudents() {

    const query = document.getElementById("studentSearch")
        .value.toLowerCase().trim();

    document.querySelectorAll("#studentsTableBody tr").forEach(row => {

        row.style.display =
            row.textContent.toLowerCase().includes(query)
                ? ""
                : "none";

    });

}

// =========================================
// NAVIGATION
// =========================================

function navigateTo(page) {

    const validPages = [
        "dashboard",
        "attendance",
        "students",
        "reports",
        "history"
    ];

    if (!validPages.includes(page)) return;

    document.querySelectorAll(".page").forEach(section => {
        section.classList.toggle("active", section.id === page);
    });

    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === page
        );
    });

    const titles = {
        dashboard: "Dashboard",
        attendance: "Attendance",
        students: "Students",
        reports: "Reports",
        history: "History"
    };

    setText("pageTitle", titles[page]);

    document.getElementById("sidebar").classList.remove("open");

    if (page === "attendance") loadAttendance();
    if (page === "history") loadHistory();
    if (page === "reports") loadReports();

    if (page === "dashboard") updateDashboard();

}

function initializeNavigation() {

    document.querySelectorAll(".nav-link").forEach(link => {

        link.addEventListener("click", () => {
            navigateTo(link.dataset.page);
        });

    });

    document.querySelectorAll("[data-go]").forEach(button => {

        button.addEventListener("click", () => {
            navigateTo(button.dataset.go);
        });

    });

}

// =========================================
// EVENT LISTENERS
// =========================================

function initializeEvents() {

    document.getElementById("menuToggle").addEventListener(
        "click",
        () => document.getElementById("sidebar").classList.toggle("open")
    );

    document.getElementById("refreshBtn").addEventListener(
        "click",
        async () => {
            await loadAllData();
            showToast("Application data refreshed!");
        }
    );

    document.getElementById("showStudentForm").addEventListener(
        "click",
        () => openStudentForm()
    );

    document.getElementById("cancelStudentForm").addEventListener(
        "click",
        closeStudentForm
    );

    document.getElementById("studentForm").addEventListener(
        "submit",
        saveStudent
    );

    document.getElementById("attendanceDate").addEventListener(
        "change",
        async event => {

            if (!event.target.value) return;

            const selectedDate = event.target.value;

            if (selectedDate > getLocalDate()) {
                showToast("Future attendance dates are not allowed.", "error");
                event.target.value = currentDate;
                return;
            }

            currentDate = selectedDate;

            await loadAttendance();

            showToast("Attendance date loaded.");

        }
    );

    document.getElementById("markAllPresent").addEventListener(
        "click",
        () => updateAllAttendance("P")
    );

    document.getElementById("markAllAbsent").addEventListener(
        "click",
        () => updateAllAttendance("A")
    );

    document.getElementById("saveAttendance").addEventListener(
        "click",
        saveAttendance
    );

    document.getElementById("studentSearch").addEventListener(
        "input",
        searchStudents
    );

    document.getElementById("reportMonth").addEventListener(
        "change",
        loadReports
    );

    document.getElementById("exportReport").addEventListener(
        "click",
        exportReport
    );

    // Dynamic table actions

    document.getElementById("studentsTableBody").addEventListener(
        "click",
        event => {

            const button = event.target.closest("[data-action]");

            if (!button) return;

            const id = button.dataset.id;

            if (button.dataset.action === "edit") {

                const student = students.find(s => s.id === id);

                if (student) openStudentForm(student);

            }

            if (button.dataset.action === "delete") {
                deleteStudent(id);
            }

        }
    );

    document.getElementById("attendanceTableBody").addEventListener(
        "click",
        event => {

            const button = event.target.closest('[data-action="toggle"]');

            if (!button) return;

            toggleAttendance(
                button.dataset.id,
                Number(button.dataset.period)
            );

        }
    );

}

// =========================================
// APPLICATION READY
// =========================================

console.log("Attendify dynamic application initialized.");
