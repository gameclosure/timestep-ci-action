const execa = require('execa');

const protectedBranches = (process.env.PROTECTED_BRANCHES || '')
  .split(',')
  .map(branch => branch.trim());

module.exports = async (tools) => {
  async function createStatus (state, description) {
    tools.log('creating status', {
      ...tools.context.repo,
      sha: tools.context.sha,
      state,
      description,
      context: process.env.STATUS_CONTEXT
    });

    const response = await tools.github.repos.createStatus({
      ...tools.context.repo,
      sha: tools.context.sha,
      state,
      description,
      context: process.env.STATUS_CONTEXT
    });

    tools.log('createStatus response', response);
  }

  await createStatus('pending');

  const headBranch = tools.context.payload.pull_request.head.ref;
  const baseBranch = tools.context.payload.pull_request.base.ref;

  tools.log('head branch', headBranch);
  tools.log('base branch', baseBranch);

  if (protectedBranches.length &&
      !protectedBranches.includes(baseBranch)) {
    await createStatus('success', 'Validation skipped');

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
    await createStatus('success', 'Validation successful');

    tools.exit.success('validation successful');
  } catch (error) {
    await createStatus('failure', 'Invalid pull request format');

    tools.log.fatal(error);
    tools.exit.failure('validation failed');
  }
};
