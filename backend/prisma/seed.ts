import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { prisma } from '../src/config/db.js';
import { normalizeEmail } from '../src/utils/email.js';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;

const ADMIN_ROLE = {
  code: 'admin',
  name: 'Administrator',
  isSystem: true,
};

const ADMIN_PERMISSIONS = [
  { code: 'roles:manage', description: 'Create, update, and delete roles.' },
  {
    code: 'permissions:manage',
    description: 'Create, update, and delete permissions.',
  },
  { code: 'users:manage', description: 'Create, update, and disable users.' },
];

// Phase 3: the portal owner role. Owners only ever receive their own
// account/session permissions — never the admin permissions above — so they
// cannot reach admin or repairer operations.
const OWNER_ROLE = {
  code: 'owner',
  name: 'Owner',
  isSystem: true,
};

const OWNER_PERMISSIONS = [
  { code: 'account:read', description: 'View the signed-in own account.' },
  {
    code: 'sessions:manage',
    description: 'List and revoke the own active sessions.',
  },
];

function generateRandomPassword(): string {
  return randomBytes(24).toString('base64url');
}

async function seedRole(role: typeof ADMIN_ROLE) {
  return prisma.role.upsert({
    where: { code: role.code },
    update: {},
    create: role,
  });
}

async function seedPermissions(
  role: { id: bigint },
  permissions: typeof ADMIN_PERMISSIONS,
) {
  for (const permission of permissions) {
    const record = await prisma.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: permission,
    });

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: record.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: record.id },
    });
  }
}

async function seedRolesAndPermissions() {
  // Upserts only: re-running the seed never creates duplicate roles,
  // permissions, or role-permission grants.
  const adminRole = await seedRole(ADMIN_ROLE);
  await seedPermissions(adminRole, ADMIN_PERMISSIONS);

  const ownerRole = await seedRole(OWNER_ROLE);
  await seedPermissions(ownerRole, OWNER_PERMISSIONS);

  return adminRole;
}

async function seedBootstrapAdmin(adminRoleId: bigint) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME ?? 'Prodora Admin';

  if (!email) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL is required to create the bootstrap admin. ' +
        'Set it as an inline environment variable when running the seed command.',
    );
  }

  // Store the address normalized (same rule as registration/login) so the
  // admin can always sign in with any casing of the same address.
  const normalizedEmail = normalizeEmail(email);

  const existingAdmin = await prisma.user.findFirst({
    where: { roleId: adminRoleId },
    select: { id: true, email: true },
  });

  if (existingAdmin && existingAdmin.email === normalizedEmail) {
    console.log('Bootstrap admin already exists with this email. Skipping.');
    return;
  }

  if (existingAdmin && process.env.BOOTSTRAP_ADMIN_ROTATE !== 'true') {
    console.log(
      `A bootstrap admin already exists (${existingAdmin.email}), which differs from ` +
        `BOOTSTRAP_ADMIN_EMAIL. Set BOOTSTRAP_ADMIN_ROTATE=true to replace its credentials. ` +
        'No changes made.',
    );
    return;
  }

  let password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  let generated = false;

  if (!password) {
    password = generateRandomPassword();
    generated = true;
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { email: normalizedEmail, passwordHash, displayName },
    });
  } else {
    await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName,
        roleId: adminRoleId,
      },
    });
  }

  const verb = existingAdmin ? 'updated' : 'created';

  if (generated) {
    console.log(`Bootstrap admin ${verb}.`);
    console.log(`  Email:    ${normalizedEmail}`);
    console.log(`  Password: ${password}`);
    console.log(
      '  This password is shown once and is not stored anywhere in plaintext. Save it now.',
    );
  } else {
    console.log(`Bootstrap admin ${verb} for ${normalizedEmail}.`);
  }
}

async function main() {
  const adminRole = await seedRolesAndPermissions();
  await seedBootstrapAdmin(adminRole.id);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
