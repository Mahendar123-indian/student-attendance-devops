
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const DB_PATH = path.join(__dirname, "database", "db.json");

function readDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function createId() {
    return require("crypto").randomUUID();
}

function validDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date || "") &&
        !Number.isNaN(Date.parse(date));
}

// ================= HEALTH CHECK =================

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Attendify backend is running",
        timestamp: new Date().toISOString()
    });
});

// ================= STUDENT APIs =================

// Get all students
app.get("/api/students", (req, res) => {
    const db = readDB();

    res.json(db.students);
});

// Add a student
app.post("/api/students", (req, res) => {
    const { rollNo, name, course, year, email } = req.body;

    if (!rollNo?.trim() || !name?.trim()) {
        return res.status(400).json({
            message: "Roll number and name are required"
        });
    }

    const db = readDB();

    const duplicate = db.students.some(
        s => s.rollNo.toLowerCase() === rollNo.trim().toLowerCase()
    );

    if (duplicate) {
        return res.status(409).json({
            message: "Roll number already exists"
        });
    }

    const student = {
        id: createId(),
        rollNo: rollNo.trim(),
        name: name.trim(),
        course: course?.trim() || "CSE",
        year: year?.trim() || "2026",
        email: email?.trim() || "",
        createdAt: new Date().toISOString()
    };

    db.students.push(student);
    writeDB(db);

    res.status(201).json({
        message: "Student added successfully",
        student
    });
});

// Update a student
app.put("/api/students/:id", (req, res) => {
    const db = readDB();

    const student = db.students.find(
        s => s.id === req.params.id
    );

    if (!student) {
        return res.status(404).json({
            message: "Student not found"
        });
    }

    const { rollNo, name, course, year, email } = req.body;

    if (!rollNo?.trim() || !name?.trim()) {
        return res.status(400).json({
            message: "Roll number and name are required"
        });
    }

    const duplicate = db.students.some(
        s => s.id !== student.id &&
        s.rollNo.toLowerCase() === rollNo.trim().toLowerCase()
    );

    if (duplicate) {
        return res.status(409).json({
            message: "Another student already uses this roll number"
        });
    }

    Object.assign(student, {
        rollNo: rollNo.trim(),
        name: name.trim(),
        course: course?.trim() || "CSE",
        year: year?.trim() || "2026",
        email: email?.trim() || ""
    });

    writeDB(db);

    res.json({
        message: "Student updated successfully",
        student
    });
});

// Delete a student
app.delete("/api/students/:id", (req, res) => {
    const db = readDB();

    const exists = db.students.some(
        s => s.id === req.params.id
    );

    if (!exists) {
        return res.status(404).json({
            message: "Student not found"
        });
    }

    db.students = db.students.filter(
        s => s.id !== req.params.id
    );

    db.attendance.forEach(record => {
        record.students = record.students.filter(
            s => s.studentId !== req.params.id
        );
    });

    writeDB(db);

    res.json({
        message: "Student deleted successfully"
    });
});

// ================= ATTENDANCE APIs =================

// Get attendance for a selected date
app.get("/api/attendance", (req, res) => {
    const { date } = req.query;

    if (!validDate(date)) {
        return res.status(400).json({
            message: "A valid date is required"
        });
    }

    const db = readDB();

    const record = db.attendance.find(
        item => item.date === date
    );

    res.json({
        date,
        students: record ? record.students : []
    });
});

// Save or update attendance
app.put("/api/attendance", (req, res) => {
    const { date, students } = req.body;

    if (!validDate(date) || !Array.isArray(students)) {
        return res.status(400).json({
            message: "Invalid attendance data"
        });
    }

    const db = readDB();

    const validStudentIds = new Set(
        db.students.map(s => s.id)
    );

    for (const item of students) {
        if (!validStudentIds.has(item.studentId)) {
            return res.status(400).json({
                message: "Invalid student ID"
            });
        }

        if (
            !Array.isArray(item.periods) ||
            item.periods.length !== 7 ||
            !item.periods.every(
                status => [null, "P", "A"].includes(status)
            )
        ) {
            return res.status(400).json({
                message: "Each student must have seven valid periods"
            });
        }
    }

    let record = db.attendance.find(
        item => item.date === date
    );

    if (record) {
        record.students = students;
        record.updatedAt = new Date().toISOString();
    } else {
        record = {
            date,
            students,
            createdAt: new Date().toISOString()
        };

        db.attendance.push(record);
    }

    writeDB(db);

    res.json({
        message: "Attendance saved successfully",
        record
    });
});

// ================= HISTORY API =================

app.get("/api/history", (req, res) => {
    const db = readDB();

    const history = db.attendance
        .map(record => {
            let present = 0;
            let absent = 0;

            record.students.forEach(student => {
                present += student.periods.filter(
                    p => p === "P"
                ).length;

                absent += student.periods.filter(
                    p => p === "A"
                ).length;
            });

            return {
                date: record.date,
                present,
                absent,
                total: present + absent,
                percentage: present + absent
                    ? Number((present / (present + absent) * 100).toFixed(1))
                    : 0
            };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

    res.json(history);
});

// ================= MONTHLY REPORT API =================

app.get("/api/reports", (req, res) => {
    const month = req.query.month;

    if (!/^\d{4}-\d{2}$/.test(month || "")) {
        return res.status(400).json({
            message: "Valid month required (YYYY-MM)"
        });
    }

    const db = readDB();

    const records = db.attendance.filter(
        item => item.date.startsWith(month)
    );

    const reports = db.students.map(student => {
        let present = 0;
        let absent = 0;

        records.forEach(record => {
            const attendance = record.students.find(
                s => s.studentId === student.id
            );

            if (attendance) {
                present += attendance.periods.filter(
                    p => p === "P"
                ).length;

                absent += attendance.periods.filter(
                    p => p === "A"
                ).length;
            }
        });

        const total = present + absent;

        return {
            ...student,
            present,
            absent,
            total,
            percentage: total
                ? Number((present / total * 100).toFixed(1))
                : 0
        };
    });

    res.json(reports);
});

// ================= FRONTEND FALLBACK =================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "../frontend/index.html")
    );
});

// ================= ERROR HANDLER =================

app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        message: "Internal server error"
    });
});

// ================= START SERVER =================

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Attendify running at http://localhost:${PORT}`);
});
