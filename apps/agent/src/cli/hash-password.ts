import { hashPassword } from '../ui/auth';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run reviewer:hash -- <password>');
  process.exit(1);
}
console.log(hashPassword(password));
