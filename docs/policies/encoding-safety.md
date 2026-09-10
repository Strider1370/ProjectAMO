# Encoding

Project source and documentation use UTF-8 with LF line endings, including Korean text.

- Preserve the encoding and line endings when editing or generating files.
- When text appears corrupted, inspect the file as UTF-8; terminal rendering alone does not establish that the stored text is damaged.
- Node scripts can read and write text with the explicit `utf8` encoding.
