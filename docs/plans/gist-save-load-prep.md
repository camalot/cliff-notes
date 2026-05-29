# GitHub Gist Save/Load Prep

toolbar, right toolbar buttons, we need to modify the Load Playground dialog and change the behavior of the Save Playground.

need to add the ability to load playground from GitHub gists. it needs to support when the user is not logged in (or when auth is not enabled) but also when they are logged in.

There needs to be a password field that can hold the users personal access token. this token should only be saved and used locally. Add a toggle field to allow the user to choose to save or not save the token. If they choose to save, it should be saved in user local storage. It should never be put in the CliffNotesProject export.

There should be a field to optionally enter gist id. this gist id acts as a "project group". The project group can hold multiple playground files. It should look at the gist, find all the files defined in the gist. it should act as basically a remote "file browser" with a tree of folders. The folders are defined by the playground files.

---

## Save Playground button changes

It should have a dropdown.

[Save Playground]

- [\<vsc:save> Locally]
- [\<vsc:github-inverted> Gist]

## Load Playground dialog

```text
Paste a playground share link
[ Text Field ]

Upload a .cliff-notes file

[ Drop a .cliff-notes file here or click to browse ]

from GitHub Gist

{if gist is already configured}

:centered-button:[\<vsc:github-inverted> Open from GitHub Gist]

                     [\<bs:x> Cancel] [\<bs:file-earmark-arrow-up Load Playground]
```

---

## Gist file explorer

It should work for both open and save.

it should allow user to create new folders. for the save dialog, the user can select an existing file or a folder. There should be a text field to allow the user to set the file name. the name should be the "\<playground name>.cliff-notes"

when open dialog, it should allow the user to select a single "\<playground name>.cliff-notes" file. It should then download the gist file and process the file as if it was opened locally by the user.

.cliff-notes file should use the public/images/cliff-notes.svg file
a closed folder should use `vsc:folder`
open folder should use `vsc:folder-opened`
the button to add a new folder should use `bs:folder-plus`.

---

## Some system architecture adjustments

currently we have what is called "project-id". This is more of the "playground-id". a "project-id" will be allow to contain 1 or more playgrounds.

gist structure:

file names of the gist:

\<project-id>.metadata # Hold Metadata of the project

the project-id is wrapped by [ ]
the project name follows the project-id and wrapped in ( )
the playground-id is wrapped by [ ]
the playground name follows the playground-id and wrapped in ( )
There can be N number of folders between the project and the playground files
[\<project-id>](Project Name)/[\<playground-id>](Playground Name).cliff-notes
\<project-id>/\<playground-id>.metadata # hold metadata of the playground

---

if the user does not enter a gist id, it will create a new gist and it will save that gist id for future use. It should use the project id as the "file name" for saving the file in the gist. `project-id>.cliff-notes`. Multiple projects can be saved in a single gist.
