module.exports = {
  appId: 'com.meewav.studio', productName: 'Meewav Studio',
  electronVersion: '44.4.5',
  extraMetadata: { main: 'apps/meewav-studio/main.cjs', description: 'Studio Meewav pour Windows', author: 'Meewav' },
  directories: { output: 'release/windows' },
  protocols: [{ name: 'Meewav authentication', schemes: ['meewav'] }],
  files: [{ from: 'dist-desktop', to: 'dist', filter: ['**/*'] }, 'apps/meewav-studio/main.cjs', 'apps/meewav-studio/preload.cjs', 'apps/meewav-studio/auth-links.cjs',
    'apps/meewav-studio/platforms/**/*', 'apps/meewav-studio/assets/**/*', 'package.json', '!node_modules/**/*'],
  asar: true, npmRebuild: false,
  win: { target: [{target:'nsis',arch:['x64']}], icon: 'apps/meewav-studio/assets/meewav.ico' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true, createStartMenuShortcut: true },
};
