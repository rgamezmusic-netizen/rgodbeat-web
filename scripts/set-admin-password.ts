import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

/**
 * Utility script to set or reset admin password in Supabase Auth.
 * Usage: npx tsx scripts/set-admin-password.ts <email> <new_password>
 */

const envPath = path.resolve(__dirname, "../.env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local not found");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !serviceMatch) {
  console.error("❌ Missing Supabase URL or Service Role Key in .env.local");
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseServiceKey = serviceMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = process.argv[2] || "admin@rgodbeat.com";
  const password = process.argv[3] || "admin123456";

  console.log(`🔒 Setting password for: ${email}`);

  // Find user by email
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("❌ Failed to list users:", listError.message);
    process.exit(1);
  }

  const user = usersData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    console.log(`⚠️ User ${email} does not exist. Creating new user...`);
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "admin" },
    });

    if (createError) {
      console.error("❌ Failed to create user:", createError.message);
      process.exit(1);
    }

    console.log(`✅ Admin user created successfully: ${created.user.email} (ID: ${created.user.id})`);
  } else {
    const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...user.user_metadata, role: "admin" },
    });

    if (updateError) {
      console.error("❌ Failed to update password:", updateError.message);
      process.exit(1);
    }

    console.log(`✅ Password updated successfully for: ${updated.user.email} (ID: ${updated.user.id})`);
  }

  console.log("-----------------------------------------");
  console.log(`Email   : ${email}`);
  console.log(`Password: ${password}`);
  console.log("Status  : Ready to login at /login");
  console.log("-----------------------------------------");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
