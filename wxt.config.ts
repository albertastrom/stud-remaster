import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "stud",
    description:
      "Study buddy. Jev keeps an allow list of tabs for whatever you are working on.",
    version: "2.0.0",
    permissions: ["storage", "tabs", "alarms"],
    host_permissions: ["https://api.typesafe.ai/*"],
    action: {
      default_title: "stud",
    },
    web_accessible_resources: [
      {
        resources: ["mascot.png"],
        matches: ["http://*/*", "https://*/*"],
      },
    ],
  },
});
