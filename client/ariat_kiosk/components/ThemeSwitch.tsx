import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@heroui/button";

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ width: 40, height: 36 }} />;
  }

  const isDark = theme === "dark";

  return (
    <Button
      isIconOnly
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      size="sm"
      variant="flat"
      onPress={() => setTheme(isDark ? "light" : "dark")}
    >
      <span style={{ fontSize: 16 }}>{isDark ? "☀️" : "🌙"}</span>
    </Button>
  );
}
