import LoginForm from "@/components/LoginForm";
import { hasPasscode } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm passcodeRequired={hasPasscode()} />;
}
