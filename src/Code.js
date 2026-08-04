function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('BPL Integrated Monitoring')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Lets Index.html pull in Stylesheet.html / ClientJS.html via
// <?!= include('Stylesheet') ?> scriptlets.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
