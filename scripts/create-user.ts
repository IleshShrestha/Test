import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import { validateEmail, normalizeEmail } from "../lib/utils/emailValidation";

const dbPath = path.join(__dirname, "..", "bank.db");
const db = new Database(dbPath);

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.error("Usage: npm run db:create-user <email>");
  console.error("Example: npm run db:create-user test@example.com");
  process.exit(1);
}

// Validate email
const emailValidation = validateEmail(email);
if (!emailValidation.isValid) {
  console.error(`Invalid email: ${emailValidation.error}`);
  process.exit(1);
}

// Show warnings if any
if (emailValidation.warnings.length > 0) {
  console.log("Email warnings:");
  emailValidation.warnings.forEach((warning) => console.log(`  - ${warning}`));
}

const normalizedEmail = normalizeEmail(email);

// Check if user already exists
const existingUser = db
  .prepare("SELECT id, email FROM users WHERE email = ?")
  .get(normalizedEmail);

if (existingUser) {
  console.error(`User with email ${normalizedEmail} already exists!`);
  process.exit(1);
}

// Default values for user creation
// These are test values - in production, you'd want to prompt for these
const defaults = {
  password: "TestPassword123!@#", // Meets all password requirements
  firstName: "Test",
  lastName: "User",
  phoneNumber: "1234567890",
  dateOfBirth: "1990-01-01", // Ensures user is 18+
  ssn: "123456789",
  address: "123 Test St",
  city: "Test City",
  state: "CA",
  zipCode: "12345",
};

// Hash password
const hashedPassword = bcrypt.hashSync(defaults.password, 10);

// Insert user
try {
  const result = db
    .prepare(
      `INSERT INTO users (
        email, 
        password, 
        first_name, 
        last_name, 
        phone_number, 
        date_of_birth, 
        ssn, 
        address, 
        city, 
        state, 
        zip_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      normalizedEmail,
      hashedPassword,
      defaults.firstName,
      defaults.lastName,
      defaults.phoneNumber,
      defaults.dateOfBirth,
      defaults.ssn,
      defaults.address,
      defaults.city,
      defaults.state,
      defaults.zipCode
    );

  console.log(`\n✅ User created successfully!`);
  console.log(`   Email: ${normalizedEmail}`);
  console.log(`   User ID: ${result.lastInsertRowid}`);
  console.log(`   Default password: ${defaults.password}`);
  console.log(`\n⚠️  Note: This user was created with default test values.`);
  console.log(
    `   Please update the user's information through the application.`
  );
} catch (error) {
  console.error("Error creating user:", error);
  process.exit(1);
} finally {
  db.close();
}
