#!/bin/sh

cd "$(dirname "$0")"

rm -rf data/ conjugacions/
tar -xf data.tar.xz
tar -xf conjugacions.tar.xz

node generate_dictionary.js
/Applications/Kindle\ Previewer\ 3.app/Contents/lib/fc/bin/kindlegen -c0 kindle/deiec.opf

rm -rf "Diccionari Essencial de la Llengua Catalana/" "Diccionari Essencial de la Llengua Catalana.zip"
mkdir "Diccionari Essencial de la Llengua Catalana"
mv kindle/deiec.mobi "Diccionari Essencial de la Llengua Catalana/Diccionari Essencial de la Llengua Catalana.mobi"
cp README.txt "Diccionari Essencial de la Llengua Catalana/"
7zz a -tzip -mx9 "deiec.zip" "Diccionari Essencial de la Llengua Catalana"
