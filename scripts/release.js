import { $ } from "zx";
$.verbose = true;
console.log("Release script started");

await $`conventional-changelog -p angular -i CHANGELOG.md -s`;

await $`git add .`;
await $`git commit -m "chore(release): bump version"`;

await $`pnpm version patch`;

await $`git push && git push --tags`;