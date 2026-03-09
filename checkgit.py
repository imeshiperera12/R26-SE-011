import subprocess

root = r'd:\SLIIT\Year 04\First_Semester\RP\RP_Security-FormalVerification'
r = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, cwd=root)
to_remove = [l for l in r.stdout.splitlines() if any(p in l for p in [
    '.certora_internal', '.certora_sources', '.certora_build',
    '.certora_config', '.certora_metadata', '.certora_verify',
    '.configuration_layout', '.vscode_extension_info',
    'component4-security-layer/run.conf',
    'gen-out.txt', 'setup-out.txt', 'verify-out.txt', 'certora-new'
])]

with open(root + r'\check.txt', 'w') as f:
    f.write(f'Count: {len(to_remove)}\n')
    for item in to_remove:
        f.write(item + '\n')

print(f'Written {len(to_remove)} paths to check.txt')

if to_remove:
    r2 = subprocess.run(
        ['git', 'rm', '--cached', '-r', '--'] + to_remove,
        capture_output=True, text=True, cwd=root
    )
    with open(root + r'\rmresult.txt', 'w') as f:
        f.write(f'Return code: {r2.returncode}\n')
        f.write(f'Removed: {len(r2.stdout.splitlines())} files\n')
        if r2.stderr:
            f.write(f'STDERR: {r2.stderr[:500]}\n')
    print(f'git rm done, rc={r2.returncode}')
else:
    print('Nothing to remove - already clean')
