import { useCallback, useEffect, useRef } from "react";
import useStateWithCallback from "./useStateWithCallback"
import ACTIONS from "../socket/actions"
import socket from "../socket/index"
import freeice from "freeice"

export const LOCAL_VIDEO = "LOCAL_VIDEO"

export default function useWebRTC(roomID) {
  const [clients, updateClients] = useStateWithCallback([])

  const addNewClient = useCallback((newClient, cb) => {
    if(!clients.includes(newClient)) {
      updateClients(list => [...list, newClient], cb)
    }
  }, [clients, updateClients])

  const peerConnections = useRef({})
  const localMediaStream = useRef(null)
  const peerMediaElements = useRef({
    [LOCAL_VIDEO]: null
  })

  useEffect(() => {
    async function handleNewPeer({ peerID, createOffer }) {
      if (peerID in peerConnections.current) {
        return console.warn(`Already connected to peer ${peerID}`);
      }

      peerConnections.current[peerID] = new RTCPeerConnection({
        iceServers: freeice()
      })

      peerConnections.current[peerID].onicecandidate = event => {
        if (event.candidate) {
          socket.emit(ACTIONS.RELAY_ICE, {
            peerID,
            iceCandidate: event.candidate
          })
        }
      }

      let trackNumber = 0
      peerConnections.current[peerID].ontrack = ({streams: [remoteStream]}) => {
        if (++trackNumber == 2) { /// ждем пока получим и видео и аудио
          addNewClient(peerID, () => {
            peerMediaElements.current[peerID].srcObject = remoteStream
          })
        }
      }
      
      localMediaStream.current.getTracks().forEach(track => {
        peerConnections.current[peerID].addTrack(track, localMediaStream.current)
      })

      if (createOffer) {
        const offer = await peerConnections.current[peerID].createOffer()

        await peerConnections.current[peerID].setLocalDescription(offer)

        socket.emit(ACTIONS.RELAY_SDP, {
          peerID,
          sessionDescription: offer
        })
      }
    }

    socket.emit(ACTIONS.ADD_PEER, handleNewPeer)
  }, [])

  useEffect(() => {
    const handleRemovePeer = ({ peerID }) => {
      if (peerConnections.current[peerID]) {
        peerConnections.current[peerID].close()
      }

      delete peerConnections.current[peerID]
      delete peerMediaElements.current[peerID]

      updateClients(list => list.filter(c => c != peerID))
    }

    socket.on(ACTIONS.REMOVE_PEER, handleRemovePeer)
  })
  
  useEffect(() => {
    async function setRemoteMedia({ peerID, sessionDescription: remoteDescription}) {
      peerConnections.current[peerID].setRemoteDescription(new RTCSessionDescription(remoteDescription))
      
      if (remoteDescription.type === 'offer') {
        const answer = await peerConnections.current[peerID].createAnswer()
  
        await peerConnections.current[peerID].setLocalDescription(answer)
  
        socket.emit(ACTIONS.RELAY_SDP, {
          peerID,
          sessionDescription: answer,
        })
      }
    }


    socket.on(ACTIONS.SESSION_DESCRIPTION, setRemoteMedia)
  })

  useEffect(() => {
    socket.on(ACTIONS.ICE_CANDIDATE, ({peerID, iceCandidate}) => {
      peerConnections.current[peerID].addIceCandidate( new RTCIceCandidate(iceCandidate) )
    })
  })

  useEffect(() => {
    async function startCapture() {
      localMediaStream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: 1280,
          height: 720,
        },
      })

      addNewClient(LOCAL_VIDEO, () => {
        const localVideoElement = peerMediaElements.current[LOCAL_VIDEO]

        if (localVideoElement) {
          localVideoElement.volume = 0
          localVideoElement.srcObject = localMediaStream.current
        }
      })
    }

    startCapture()
      .then(() => socket.emit(ACTIONS.JOIN, { room: roomID }))
      .catch(e => console.warn("Error getting UserMedia: ", e))

    return () => {
      localMediaStream.current.getTracks().forEach(track => track.stop())

      socket.emit(ACTIONS.LEAVE)
    }
  }, [roomID])


  const provideMediaRef = useCallback((id, node) => {
    peerMediaElements.current[id] = node
  }, [])

  return { clients, provideMediaRef }
}
