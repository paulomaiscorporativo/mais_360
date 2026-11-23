import { describe, expect, it } from "vitest";
import {
  accessTokenExpiry,
  accessTokenProblem,
  accessTokenStatus,
  canDeactivateUser,
  platformRoleChangeProblem,
  renderAuthEmail,
  resolveProjectRole,
  userAccessStatus,
  workspaceInviteProblem,
  workspaceRemovalProblem,
  workspaceRoleChangeProblem,
  type AccessTokenState,
  type ActorAuthority,
} from ".";

const now = new Date("2026-11-23T12:00:00Z");
const token = (over: Partial<AccessTokenState> = {}): AccessTokenState => ({
  purpose: "INVITE",
  expiresAt: new Date(now.getTime() + 1000),
  usedAt: null,
  revokedAt: null,
  ...over,
});

describe("tokens de acesso", () => {
  it("convite vale 7 dias e redefinição 1 hora", () => {
    expect(accessTokenExpiry("INVITE", now).getTime() - now.getTime()).toBe(7 * 86_400_000);
    expect(accessTokenExpiry("PASSWORD_RESET", now).getTime() - now.getTime()).toBe(3_600_000);
  });

  it("é válido até expirar", () => {
    expect(accessTokenStatus(token(), now)).toBe("VALID");
    expect(accessTokenStatus(token({ expiresAt: now }), now)).toBe("EXPIRED");
  });

  it("uso e revogação vencem a expiração", () => {
    const old = new Date(now.getTime() - 10_000);
    expect(accessTokenStatus(token({ usedAt: old, expiresAt: old }), now)).toBe("USED");
    expect(accessTokenStatus(token({ revokedAt: old, expiresAt: old }), now)).toBe("REVOKED");
  });

  it("explica o problema em português", () => {
    expect(accessTokenProblem(token(), now)).toBeNull();
    expect(accessTokenProblem(null, now)).toMatch(/não é válido/);
    expect(accessTokenProblem(token({ expiresAt: now }), now)).toMatch(/convite expirou/);
    expect(accessTokenProblem(token({ purpose: "PASSWORD_RESET", usedAt: now }), now)).toMatch(
      /já foi usado/,
    );
  });
});

describe("situação do acesso", () => {
  it("distingue ativo, convite pendente e desativado", () => {
    expect(userAccessStatus({ active: false, mustChangePassword: true, lastLoginAt: null })).toBe(
      "DISABLED",
    );
    expect(userAccessStatus({ active: true, mustChangePassword: true, lastLoginAt: null })).toBe(
      "INVITED",
    );
    expect(userAccessStatus({ active: true, mustChangePassword: false, lastLoginAt: null })).toBe(
      "ACTIVE",
    );
  });
});

describe("equipe do assinante", () => {
  const counts = { owners: 1, managers: 2 };

  it("só dono convida dono", () => {
    expect(workspaceInviteProblem("ADMIN", "OWNER")).toMatch(/Só um dono/);
    expect(workspaceInviteProblem("OWNER", "OWNER")).toBeNull();
    expect(workspaceInviteProblem("OPERATOR", "OPERATOR")).toMatch(/Só donos/);
  });

  it("não rebaixa o último dono", () => {
    expect(
      workspaceRoleChangeProblem({
        actorRole: "OWNER",
        currentRole: "OWNER",
        nextRole: "ADMIN",
        isSelf: true,
        counts,
      }),
    ).toMatch(/pelo menos um dono/);
    expect(
      workspaceRoleChangeProblem({
        actorRole: "OWNER",
        currentRole: "OWNER",
        nextRole: "ADMIN",
        isSelf: false,
        counts: { owners: 2, managers: 3 },
      }),
    ).toBeNull();
  });

  it("admin não mexe em dono", () => {
    expect(
      workspaceRoleChangeProblem({
        actorRole: "ADMIN",
        currentRole: "OWNER",
        nextRole: "OPERATOR",
        isSelf: false,
        counts: { owners: 2, managers: 3 },
      }),
    ).toMatch(/Só um dono/);
  });

  it("último administrador não se rebaixa", () => {
    expect(
      workspaceRoleChangeProblem({
        actorRole: "ADMIN",
        currentRole: "ADMIN",
        nextRole: "OPERATOR",
        isSelf: true,
        counts: { owners: 0, managers: 1 },
      }),
    ).toMatch(/último administrador/);
    expect(
      workspaceRoleChangeProblem({
        actorRole: "ADMIN",
        currentRole: "ADMIN",
        nextRole: "OPERATOR",
        isSelf: true,
        counts,
      }),
    ).toBeNull();
  });

  it("remoção respeita o último dono e o próprio acesso", () => {
    expect(
      workspaceRemovalProblem({ actorRole: "OWNER", targetRole: "OWNER", isSelf: false, counts }),
    ).toMatch(/pelo menos um dono/);
    expect(
      workspaceRemovalProblem({ actorRole: "ADMIN", targetRole: "ADMIN", isSelf: true, counts }),
    ).toMatch(/próprio acesso/);
    expect(
      workspaceRemovalProblem({ actorRole: "ADMIN", targetRole: "FINANCE", isSelf: false, counts }),
    ).toBeNull();
  });
});

describe("equipe da plataforma", () => {
  it("mantém pelo menos um superadmin", () => {
    expect(
      platformRoleChangeProblem({
        currentRole: "SUPERADMIN",
        nextRole: "SUPPORT",
        isSelf: false,
        superadmins: 1,
      }),
    ).toMatch(/pelo menos um superadmin/);
    expect(
      platformRoleChangeProblem({
        currentRole: "SUPERADMIN",
        nextRole: "NONE",
        isSelf: false,
        superadmins: 2,
      }),
    ).toBeNull();
    expect(
      platformRoleChangeProblem({
        currentRole: "SUPERADMIN",
        nextRole: "SUPPORT",
        isSelf: true,
        superadmins: 2,
      }),
    ).toMatch(/próprio acesso/);
  });
});

describe("autoridade para desativar a conta", () => {
  const wsAdmin: ActorAuthority = {
    superadmin: false,
    workspaceRoles: { ws1: "ADMIN" },
    tenantRoles: {},
  };
  const tenantAdmin: ActorAuthority = {
    superadmin: false,
    workspaceRoles: {},
    tenantRoles: { t1: "ADMIN" },
  };

  it("admin do assinante desativa quem só tem vínculos dele", () => {
    expect(
      canDeactivateUser(wsAdmin, {
        platformRole: "NONE",
        workspaces: [{ workspaceId: "ws1", role: "OPERATOR" }],
        tenants: [{ tenantId: "t1", workspaceId: "ws1" }],
      }),
    ).toBe(true);
  });

  it("não desativa quem tem vínculo em outro assinante", () => {
    expect(
      canDeactivateUser(wsAdmin, {
        platformRole: "NONE",
        workspaces: [],
        tenants: [
          { tenantId: "t1", workspaceId: "ws1" },
          { tenantId: "t9", workspaceId: "ws2" },
        ],
      }),
    ).toBe(false);
  });

  it("admin do cliente só desativa quem tem apenas aquele cliente", () => {
    const only = {
      platformRole: "NONE" as const,
      workspaces: [],
      tenants: [{ tenantId: "t1", workspaceId: "ws1" }],
    };
    expect(canDeactivateUser(tenantAdmin, only)).toBe(true);
    expect(
      canDeactivateUser(tenantAdmin, {
        ...only,
        workspaces: [{ workspaceId: "ws1", role: "OPERATOR" }],
      }),
    ).toBe(false);
  });

  it("admin não desativa dono nem equipe da plataforma", () => {
    expect(
      canDeactivateUser(wsAdmin, {
        platformRole: "NONE",
        workspaces: [{ workspaceId: "ws1", role: "OWNER" }],
        tenants: [],
      }),
    ).toBe(false);
    expect(
      canDeactivateUser(wsAdmin, { platformRole: "SUPPORT", workspaces: [], tenants: [] }),
    ).toBe(false);
    expect(
      canDeactivateUser(
        { superadmin: true, workspaceRoles: {}, tenantRoles: {} },
        {
          platformRole: "SUPPORT",
          workspaces: [{ workspaceId: "ws1", role: "OWNER" }],
          tenants: [],
        },
      ),
    ).toBe(true);
  });
});

describe("acesso por projeto", () => {
  it("papel herdado ou ADMIN vê todos os projetos", () => {
    expect(
      resolveProjectRole({ tenantRole: "ADMIN", membership: { allProjects: false }, grant: null }),
    ).toBe("ADMIN");
    expect(resolveProjectRole({ tenantRole: "MANAGER", membership: null, grant: null })).toBe(
      "MANAGER",
    );
  });

  it("vínculo com todos os projetos usa o papel do vínculo", () => {
    expect(
      resolveProjectRole({
        tenantRole: "OPERATOR",
        membership: { allProjects: true },
        grant: null,
      }),
    ).toBe("OPERATOR");
  });

  it("vínculo restrito só acessa projetos liberados", () => {
    const membership = { allProjects: false };
    expect(resolveProjectRole({ tenantRole: "OPERATOR", membership, grant: null })).toBeNull();
    expect(resolveProjectRole({ tenantRole: "OPERATOR", membership, grant: { role: null } })).toBe(
      "OPERATOR",
    );
    expect(
      resolveProjectRole({ tenantRole: "OPERATOR", membership, grant: { role: "SCANNER" } }),
    ).toBe("SCANNER");
  });
});

describe("e-mail de sistema", () => {
  const base = {
    recipientName: "Ana <Souza>",
    link: "https://app.exemplo.com/entrar/convite/abc",
    brand: { name: "Mais 360", color: "#002042", byline: "por Mais Corporativo" },
  };

  it("convite traz o link, a validade e escapa HTML", () => {
    const m = renderAuthEmail({
      ...base,
      kind: "INVITE",
      contextName: "ABIEC",
      roleLabel: "Operador",
    });
    expect(m.subject).toBe("Seu acesso ao Mais 360");
    expect(m.text).toContain(base.link);
    expect(m.text).toContain("7 dias");
    expect(m.html).toContain("Olá, Ana.");
    expect(m.html).not.toContain("<Souza>");
    expect(m.html).toContain("em ABIEC como Operador");
  });

  it("redefinição informa a validade de 1 hora", () => {
    const m = renderAuthEmail({ ...base, kind: "PASSWORD_RESET" });
    expect(m.text).toContain("1 hora");
    expect(m.subject).toMatch(/Redefinição de senha/);
  });

  it("cor inválida cai na cor padrão", () => {
    const m = renderAuthEmail({
      ...base,
      kind: "ACCESS_GRANTED",
      brand: { name: "X", color: "red;}" },
    });
    expect(m.html).toContain("#002042");
    expect(m.html).not.toContain("red;}");
  });
});
