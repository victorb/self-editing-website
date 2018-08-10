const $files = document.querySelector('#files')
const $filesNew = document.querySelector('#files-new')

const $historyLink = document.querySelector('#history-link')
const $historyVersions = document.querySelector('#history-versions')

const $editor = document.querySelector('#editor')
const $editorFilename = document.querySelector('#editor-filename')
const $editorSave = document.querySelector('#editor-save')
const $editorApprove = document.querySelector('#editor-approve')
const $editorSyntax = document.querySelector('#editor-syntax')
const $editorOfferPatch = document.querySelector('#editor-offer-patch')

const $chat = document.querySelector('#chat')
const $chatMessage = document.querySelector('#chat-message')
const $chatSend = document.querySelector('#chat-send')

const $codemirror = CodeMirror.fromTextArea($editor, {lineNumbers: true})

const PATCH_TOPIC = 'patch-topic'

const node = new window.Ipfs({
  // TODO fix issue with persistance
  repo: '/ipfs-' + Math.random(),
  config: {
  	Addresses: {
    	Swarm: [
        	'/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star/'
        ]
    }
  },
  EXPERIMENTAL: {
    pubsub: true
  }
})
const rootHash = window.location.pathname.split('/')[2]

window.addEventListener('message', (msg) => {
  // Current tab
  if (msg.data === 'request-close') {
    // Show approval button
    console.log('request-close', msg, msg.data)
    $editorApprove.removeAttribute('disabled')
    $editorApprove.addEventListener('click', () => {
      msg.source.postMessage('approve-close', '*')
      $editorApprove.setAttribute('disabled', 'disabled')
    })
  }
  // Previous tab
  if (msg.data === 'approve-close') {
    window.close()
  }
})

$filesNew.addEventListener('click', () => {
  const filename = window.prompt('Name of your file')
  if (filename === "" || filename === null) {
    console.log('cancelled')
  } else {
    $editorFilename.value = filename
    $codemirror.setValue('')
  }
})

const syntaxMap = {
  'js': 'javascript',
  'html': 'htmlmixed',
  'md': 'markdown'
}

function setSyntax(val) {
  if (syntaxMap[val.toLowerCase()]) {
    $codemirror.setOption('mode', syntaxMap[val.toLowerCase()])
  } else {
    $codemirror.setOption('mode', val)
  }
}

function replaceCurrentRootHash(rootHash, toReplaceWith) {
  const re = new RegExp(rootHash, 'g')
  return window.location.toString().replace(re, toReplaceWith)
}

$editorSyntax.addEventListener('change', (e) => {
  setSyntax(e.target.value)
})

node.once('ready', () => {
  console.log('node is ready')
  let NODE_ID
  node.id().then(res => NODE_ID = res.id)

  function loadFile (hash) {
    console.log('hash to load', hash)
    const filename = hash.split('/')[1]
    $editorFilename.value = filename

    const split = filename.split('.')
    const ext = split[split.length - 1]
    setSyntax(ext)
    $editorSyntax.value = ext

    node.files.cat(hash, (err, file) => {
      if (err) throw err
      $codemirror.setValue(file.toString())
    })
  }

  window.addEventListener('hashchange', () => {
    const fileToLoad = window.location.hash.substring(1)
    loadFile(fileToLoad)
  })

  if (window.location.hash !== "") {
    const fileToLoad = window.location.hash.substring(1)
    loadFile(fileToLoad)
  }
  
  node.pubsub.subscribe(PATCH_TOPIC, (msg) => {
    if (msg.from === NODE_ID) {
    	return
    }
    // Don't receive from yourself!
    const data = JSON.parse(msg.data.toString())
    // data.hash, data.filename
    if (data.filename === $editorFilename.value) {
      node.files.cat(data.hash, (err, res) => {
        if (err) throw err
        const newContent = res.toString()
        const d = new diff()
        const diffHtml = d.prettyHtml(d.main($codemirror.getValue(), newContent))
        // override status
        document.querySelector('.Status').innerHTML = diffHtml
      })
    }
  })
  
  $editorOfferPatch.addEventListener('click', () => {
  	// grab current file
    // add to ipfs
    // create object with content + filename
    // broadcast patch!
    const currentContent = $codemirror.getValue()
    const filename = $editorFilename.value
    
    node.files.add(node.types.Buffer.from(currentContent)).then((res) => {
      const hashOfCurrentContent = res[0].hash
      const patchOffer = {
        hash: hashOfCurrentContent,
        filename
      }
      const req = node.types.Buffer.from(JSON.stringify(patchOffer))
      node.pubsub.publish(PATCH_TOPIC, req)
    })
  })

  $editorSave.addEventListener('click', () => {
    const fileContents = $codemirror.getValue()
    const currentFilename = $editorFilename.value

    let newRootHash
    // Remove previous file from current root hash
    node.object.patch.rmLink(rootHash, {
      name: currentFilename
    }).then((res) => {
      newRootHash = res.toJSON().multihash
      console.log('newRootHash', newRootHash)
      // Add new file to IPFS
      return node.files.add(node.types.Buffer.from(fileContents))
    }).then((res) => {
      const fileHash = res[0].hash
      console.log('adding fileHash', fileHash)
      // Add hash of new file to new root hash
      return node.object.patch.addLink(newRootHash, {
        name: currentFilename,
        multihash: fileHash
      })
    }).then((res) => {
      newRootHash = res.toJSON().multihash
      return node.object.patch.rmLink(newRootHash, {
        name: 'previous_version'
      })
    }).then((res) => {
      newRootHash = res.toJSON().multihash
      return node.files.add(node.types.Buffer.from(rootHash))
    }).then((res) => {
      const previousVersionHash = res[0].hash
      return node.object.patch.addLink(newRootHash, {
        name: 'previous_version',
        multihash: previousVersionHash
      })
    }).then((res) => {
      newRootHash = res.toJSON().multihash
      console.log('New website is here: ', newRootHash)

      const newURL = replaceCurrentRootHash(rootHash, newRootHash)

      const newTab = window.open(newURL, '_blank')

      newTab.onload = () => {
        console.log('new tab finished loading')
        newTab.postMessage('request-close', '*')
      }
    }).catch((err) => {
      console.log(err)
    })
  })

  node.swarm.connect('/ip4/192.168.2.238/tcp/4002/ws/ipfs/QmPnozHX3WnmxvCygL5waEfU7uxVnYHVuMZJfwwMYcSAfW', (err, res) => {
    console.log(err, res)
  })

  // $historyVersions

  function resolvePreviousVersions (hash, collectedVersions, callback) {
    node.files.cat(hash + '/previous_version', (err, res) => {
      if (err) {
        if (err.toString().includes('No such file')) {
          return callback(null, collectedVersions)
        } else {
          return callback(err, collectedVersions)
        }
      }
      const newVersions = collectedVersions.concat([res.toString()])
      resolvePreviousVersions(res.toString(), newVersions, callback)
    })
  }

  resolvePreviousVersions(rootHash, [], (err, versions) => {
    if (err) throw err
    console.log('all versions:', versions)
    versions.forEach((version) => {
      const $version = document.createElement('div')
      const link = `<a href="${window.location.origin}/ipfs/${version}">${version}</a>`
      $version.innerHTML = link
      $historyVersions.appendChild($version)
    })
  })

  node.files.cat(rootHash + '/previous_version', (err, res) => {
    if (err) throw err
    $historyLink.setAttribute('href', replaceCurrentRootHash(rootHash, res.toString()))
    $historyLink.innerText = res.toString()
  })

  node.ls(rootHash, (err, files) => {
    if (err) throw err
    console.log(files)
    files.forEach((file) => {
      // depth, name, path
      const $file = document.createElement('div')
      const link = `<a href="#${file.path}">${file.name}</a>`
      $file.innerHTML = link
      console.log($files)
      console.log($file)
      $files.appendChild($file)
    })
  })
  
  
  // Start chat
  // $chat
  const TOPIC = 'testing-self-editing' // might want to change this to rootHash
  const seenMessages = [] // TODO add garbage collection
  
  node.pubsub.subscribe(TOPIC, (msg) => {
    if (seenMessages.includes(msg.seqno.toString())) {
    	return
    }
    seenMessages.push(msg.seqno.toString())
    const el = document.createElement('div')
    el.innerText = msg.data.toString()
    $chat.appendChild(el)
  })
  $chatSend.addEventListener('click', () => {
  	const msgToSend = $chatMessage.value.trim()
    node.pubsub.publish(TOPIC, node.types.Buffer.from(msgToSend))
    $chatMessage.value = ''
  })

})

node.once('error', (err) => {
  console.error(err)
})