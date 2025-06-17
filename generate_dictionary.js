const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

function normalizeText(text = "") {
  text = text.normalize("NFC");
  return text
    .replace(/\u00A0/g, " ")
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function generateKindleHeader() {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns:math="http://exslt.org/math"
      xmlns:svg="http://www.w3.org/2000/svg"
      xmlns:tl="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf"
      xmlns:saxon="http://saxon.sf.net/"
      xmlns:xs="http://www.w3.org/2001/XMLSchema"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:cx="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:mbp="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf"
      xmlns:mmc="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf"
      xmlns:idx="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body>
  <mbp:frameset>`;
}

function generateKindleFooter() {
  return `
  </mbp:frameset>
</body>
</html>`;
}

function generateDictionaryEntry(id, headword, terms, body) {
  const additionalForms = terms.slice(1);
  const inflSection =
    additionalForms.length > 0
      ? `<idx:infl>
        ${additionalForms
          .map((term) => `<idx:iform value="${term}" exact="true"></idx:iform>`)
          .join(" ")}
      </idx:infl>`
      : "";

  return {
    id,
    headword,
    content: `
    <idx:entry name="catalan" scriptable="yes">
      <idx:short>
        <a id="${id}"></a>
        <idx:orth value="${terms[0]}" exact="true">${headword}${inflSection}</idx:orth>
        ${body}
      </idx:short>
    </idx:entry>`,
  };
}

function buildKindleDictionary() {
  const outputDir = path.join(__dirname, "kindle");
  const directory = path.join(__dirname, "data");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // First, collect the conjugations.
  const verbForms = {};
  const directory_c = "conjugacions";
  const files_c = fs
    .readdirSync(path.join(__dirname, directory_c))
    .filter((file) => file.endsWith(".html"));
  files_c.forEach((file) => {
    const filePath = path.join(directory_c, file);
    const htmlContent = fs.readFileSync(filePath, "utf-8");
    const id = 100000 + path.basename(file, ".html");
    const $ = cheerio.load(htmlContent);
    $('[style="display: none;"]').remove();

    // Get an array of unique text of infinitive forms
    const infinitius = $('span.dm2-linia.dm2-temps:contains("Infinitiu")')
      .map((_, elem) => $(elem).next(".dm2-linia").text()) // Get text of the next sibling
      .get() // Convert Cheerio object to array
      .flatMap((text) => text.split(/\s+o\s+/)) // Split on " o " and flatten the result
      .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

    const formes = $("span.dm2-linia:not(.dm2-temps)")
      .map((_, elem) => $(elem).text())
      .get()
      .flatMap((text) => text.split(/\s+o\s+/))
      .filter((verb) => verb !== " ")
      .filter((verb) => verb !== " ")
      .filter((verb) => verb !== "-")
      .filter((verb) => !infinitius.includes(verb))
      .filter((value, index, self) => self.indexOf(value) === index);

    if (infinitius && formes) {
      infinitius.forEach((infinitive) => {
        verbForms[infinitive] = formes;
      });
    }
  });

  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".html"));

  const entries = [];

  files.forEach((file) => {
    const filePath = path.join(directory, file);
    const htmlContent = fs.readFileSync(filePath, "utf-8");

    const id = path.basename(file, ".html");

    const $ = cheerio.load(htmlContent);

    if ($(".dm2-areatem").length === 0) {
      // This happens with entries that do not contain useful information.
      // Hopefully the word will get handled in another entry.
      return;
    }

    $('[style="display: none;"]').remove();

    // Remove unnecessary extra information
    $(".dm2-infcom").remove();
    $(".dm2-areatem").remove();
    $(".dm2-rmt-cnt").remove();
    $("[onclick]").each(function () {
      $(this).removeAttr("onclick");
    });

    const mainTerm = normalizeText($(".dm2-article").html());
    let terms_array = [];
    $(".dm2-article > b, .rel b").each((_, element) => {
      $(element).find("sup").remove();
      terms_array.push(normalizeText($(element).text()));
    });

    $(".dm2-articleflex i").each((_, element) => {
      $(element).find("sup").remove();
      let form = normalizeText($(element).text());
      // Split by " o " or ",", then trim whitespace and filter out empty entries.
      const parts = form
        .split(/,\s*| o /)
        .map((part) => part.trim())
        .filter(Boolean);
      terms_array.push(...parts);
    });

    const isVerb = mainTerm.includes("<i>v.</i>");
    if (isVerb) {
      if (!verbForms[terms_array[0]]) {
        console.log("Error amb la conjugació del verb " + terms_array[0]);
      } else {
        terms_array.push(...verbForms[terms_array[0]]);
      }
    }

    // Ensure terms_array only contains unique values
    terms_array = [...new Set(terms_array)];

    $(".k-i-kpi-status-open").html("&#9679;"); // ●
    $(".k-i-kpi-status-deny").html("&#9670;"); // ◆
    $(".k-i-stop").html("&#9632;"); // ■

    const body = normalizeText($("#cont-article").html());
    entries.push(generateDictionaryEntry(id, mainTerm, terms_array, body));
  });

  // Sort entries.
  entries.sort((a, b) => a.headword.localeCompare(b.headword, "ca"));

  let dictionaryContent = "";
  let fileIndex = 1;
  let entryCount = 0;
  const maxEntriesPerFile = 1000;
  const fileNames = [];

  entries.forEach((entry, idx) => {
    dictionaryContent += entry.content;
    entryCount++;

    if (entryCount === maxEntriesPerFile || idx === entries.length - 1) {
      const fileName = `deiec${String(fileIndex).padStart(3, "0")}.xhtml`;
      fileNames.push(fileName);
      const outputPath = path.join(outputDir, fileName);
      const fileContent =
        generateKindleHeader() + dictionaryContent + generateKindleFooter();
      fs.writeFileSync(outputPath, fileContent, "utf-8");
      console.log(`File ${outputPath} written with ${entryCount} entries`);

      // Reset for next file
      dictionaryContent = "";
      entryCount = 0;
      fileIndex++;
    }
  });

  generateOpfFile(outputDir, fileNames);
  console.log(`Dictionary split into ${fileIndex - 1} files successfully.`);
}

function generateOpfFile(outputDir, fileNames) {
  const opfContent = `<?xml version="1.0"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
  <metadata>
    <dc:title>Diccionari Essencial de la Llengua Catalana</dc:title>
    <dc:creator opf:role="aut">Institut d'Estudis Catalans</dc:creator>
    <dc:language>ca</dc:language>
    <x-metadata>
      <DictionaryInLanguage>ca</DictionaryInLanguage>
      <DictionaryOutLanguage>ca</DictionaryOutLanguage>
      <DefaultLookupIndex>catalan</DefaultLookupIndex>
    </x-metadata>
  </metadata>
  <manifest>
    ${fileNames
      .map(
        (fileName, index) =>
          `<item id="deiec${String(index + 1).padStart(
            3,
            "0",
          )}" href="${fileName}" media-type="application/xhtml+xml" />`,
      )
      .join("\n    ")}
  </manifest>
  <spine>
    ${fileNames
      .map(
        (_, index) =>
          `<itemref idref="deiec${String(index + 1).padStart(3, "0")}"/>`,
      )
      .join("\n    ")}
  </spine>
</package>`;

  const opfPath = path.join(outputDir, "deiec.opf");
  fs.writeFileSync(opfPath, opfContent, "utf-8");
  console.log(`OPF file written at ${opfPath}`);
}

buildKindleDictionary();
