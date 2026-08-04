function onOpen() {
  SpreadsheetApp.getUi().createMenu('CueTeds').addItem('Run', 'main').addToUi();
}

function main() {
  Logger.log('CueTeds build script running.');
}
