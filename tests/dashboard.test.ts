import { describe, expect, test } from "bun:test";
import type { Actor } from "../src/core/permissions";
import { dashboardExperience } from "../src/web/pages/Dashboard";

const actor = (roles: string[], permissions: string[]): Actor => ({ id: crypto.randomUUID(), displayName: "Pengguna", roles, permissions });

describe("role-specific dashboard experience", () => {
  test("selects each role workspace and only exposes permitted quick actions", () => {
    const admin = dashboardExperience(actor(["admin"], ["admin.users.manage", "academic.manage", "reports.view", "audit.view"]));
    expect(admin.role).toBe("admin");
    expect(admin.actions.map(action => action.href)).toEqual(["/admin/users", "/admin/academic", "/reports", "/admin/audit"]);

    const teacher = dashboardExperience(actor(["teacher"], ["learning.manage", "attendance.manage", "reports.view"]));
    expect(teacher.role).toBe("teacher");
    expect(teacher.actions.map(action => action.href)).toEqual(["/learning", "/attendance", "/projects", "/reports"]);

    const assistant = dashboardExperience(actor(["asmen"], ["dashboard:view", "learning.view", "learning.assist", "attendance.manage"]));
    expect(assistant.role).toBe("asmen");
    expect(assistant.actions.map(action => action.href)).toEqual(["/attendance", "/calendar"]);
    expect(assistant.actions.some(action => action.label.includes("Kelola"))).toBe(false);

    const student = dashboardExperience(actor(["student"], ["learning.view"]));
    expect(student.role).toBe("student");
    expect(student.actions.map(action => action.href)).toEqual(["/learning", "/attendance", "/projects", "/gamification"]);
  });

  test("uses the highest-responsibility role for multi-role accounts", () => {
    expect(dashboardExperience(actor(["student", "asmen"], [])).role).toBe("asmen");
    expect(dashboardExperience(actor(["student", "teacher"], [])).role).toBe("teacher");
    expect(dashboardExperience(actor(["teacher", "admin"], [])).role).toBe("admin");
  });
});
