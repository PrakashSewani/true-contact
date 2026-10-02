export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.log('TrueContact connector installed.');
  });
});
