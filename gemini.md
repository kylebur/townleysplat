Gemini rules

You must do a local git add and commit after every prompt
	You should include a summary of the prompt and the change in the description for each commit
You must update the file with version numbers on each update.  It should be visible in the corner of the gui (if it is a gui app) and in comment lines at the beginning of every code file.
You should also include a Readme.md showing the point of the project and update that as it evolves with a change log.

We prefer bash and python to solve problems and write code.  If you need to pip install something, and the project does not yet have a venv, you should create the venv, update pip, and then pip install the package.

If you need to create system service to accomplish a task, be careful to check if ports are in use and if names are available.  For example, don’t name the service the same as an already-running service, because a pkill might kill both.  

Record these directives in a gemini.md file (or equivalent)

git@github.com:kylebur/townleysplat.git

If this is being synced to GitHub, make sure a link to the live demo page on GitHub is included in the readme file.
