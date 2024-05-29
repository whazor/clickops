import { $ } from "zx";
$.verbose = true;
console.log("Release script started");

await $`pnpm version patch`;

await $`conventional-changelog -p angular -i CHANGELOG.md -s`;

await $`git add CHANGELOG.md package.json`;
await $`git commit -m "chore(release): bump version"`;


await $`git push && git push --tags`;
