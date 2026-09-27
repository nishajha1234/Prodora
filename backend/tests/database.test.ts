import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { prisma, withTransaction } from '../src/config/db.js';

const testCode = (label: string) => `test_${label}_${randomUUID().slice(0, 8)}`;

let createdRoleIds: bigint[] = [];
let createdPermissionIds: bigint[] = [];
let createdUserIds: bigint[] = [];

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds = [];
  }
  if (createdPermissionIds.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: { permissionId: { in: createdPermissionIds } },
    });
    await prisma.permission.deleteMany({
      where: { id: { in: createdPermissionIds } },
    });
    createdPermissionIds = [];
  }
  if (createdRoleIds.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    createdRoleIds = [];
  }
});

describe('database connectivity', () => {
  it('connects to MySQL/MariaDB and executes a query', async () => {
    const result = await prisma.$queryRaw<
      { result: bigint }[]
    >`SELECT 1 + 1 AS result`;

    expect(Number(result[0]?.result)).toBe(2);
  });
});

describe('schema constraints', () => {
  it('assigns a uuid and rejects a duplicate role code', async () => {
    const code = testCode('role');
    const role = await prisma.role.create({
      data: { code, name: 'Test Role' },
    });
    createdRoleIds.push(role.id);

    expect(role.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    await expect(
      prisma.role.create({ data: { code, name: 'Duplicate Role' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a user referencing a non-existent role', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: `${testCode('email')}@example.test`,
          passwordHash: 'irrelevant-for-this-test',
          displayName: 'Orphan User',
          roleId: 999_999_999n,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a duplicate user email', async () => {
    const role = await prisma.role.create({
      data: { code: testCode('role'), name: 'Test Role' },
    });
    createdRoleIds.push(role.id);

    const email = `${testCode('email')}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant-for-this-test',
        displayName: 'First User',
        roleId: role.id,
      },
    });
    createdUserIds.push(user.id);

    await expect(
      prisma.user.create({
        data: {
          email,
          passwordHash: 'irrelevant-for-this-test',
          displayName: 'Second User',
          roleId: role.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('seed repeatability', () => {
  it('upserting the same role code twice yields exactly one row', async () => {
    const code = testCode('role');

    const first = await prisma.role.upsert({
      where: { code },
      update: {},
      create: { code, name: 'Idempotent Role' },
    });
    const second = await prisma.role.upsert({
      where: { code },
      update: {},
      create: { code, name: 'Idempotent Role' },
    });
    createdRoleIds.push(first.id);

    expect(second.id).toBe(first.id);

    const count = await prisma.role.count({ where: { code } });
    expect(count).toBe(1);
  });
});

describe('transaction helper', () => {
  it('rolls back all writes when one operation fails', async () => {
    const code = testCode('role');

    await expect(
      withTransaction(async (tx) => {
        const role = await tx.role.create({
          data: { code, name: 'Rollback Role' },
        });
        createdRoleIds.push(role.id);
        await tx.role.create({ data: { code, name: 'Duplicate' } });
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    const count = await prisma.role.count({ where: { code } });
    expect(count).toBe(0);
    createdRoleIds = [];
  });
});
