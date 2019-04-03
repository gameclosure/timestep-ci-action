const execa = require('execa');
const { Toolkit } = require('actions-toolkit');

const protectedBranches = (process.env.PROTECTED_BRANCHES || '')
  .split(',')
  .map(branch => branch.trim());

module.exports = async (yargs) => {
  const tools = new Toolkit({
    event: [
      'pull_request.opened',
      'pull_request.edited',
      'pull_request.reopened',
      'pull_request.synchronize'
    ]
  });

  const headRef = tools.context.payload.pull_request.head.ref;
  const baseBranch = tools.context.payload.pull_request.base.ref;

  tools.log('head ref', headRef);
  tools.log('base ref', baseBranch);

  if (protectedBranches.length &&
      !protectedBranches.includes(baseBranch)) {
    tools.log('protected branches', protectedBranches);

    tools.exit.neutral('skipping validation for unprotected branch');
  }

  const subprocess = execa('npx', [
    'tsci', 'changelog', 'status',
    '--cwd=' + tools.workspace,
    '--auth-token=' + tools.token,
    '--pull-request=' + tools.context.payload.pull_request.number
  ]);

  subprocess.stdout.pipe(process.stdout);

  try {
    await subprocess;
  } catch (error) {
    tools.log('tsci exited with code ' + error.exitCode + ': ' + error.message);
    tools.log.fatal(error);

    tools.exit.failure('pull request validation error!');
  }

  try {
    await tools.github.repos.createStatus({
      ...tools.context.repo,
      sha: tools.context.sha,
      state: 'success',
      context: 'Timestep CI Action',
      description: 'Format validation successful!'
    });
  } catch (error) {
    tools.log('failed to create commit status');
    tools.log.fatal(error);

    tools.exit.failure('pull request validation error!');
  }

  tools.exit.success('pull request validation successful!');
};
