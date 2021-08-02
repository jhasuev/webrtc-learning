import { useEffect, useRef, useState } from "react";
import socket from "../../socket/"
import ACTIONS from "../../socket/actions";
import { v4 } from "uuid";
import { useHistory } from "react-router";

export default function Main() {
  const history = useHistory()
  const [ rooms, updateRooms ] = useState([])

  const rootNode = useRef()

  useEffect(() => {
    socket.on(ACTIONS.SHARE_ROOM, ({rooms = []}) => {
      if (rootNode.current) {
        updateRooms(rooms)
      }
    })
  }, [])

  return (
    <div key={rootNode}>
      <h1>Available rooms</h1>
      <ul>
        {rooms.map(roomID => {
          <li key={roomID}>
            {roomID}
            <button onClick={() => {
              history.push(`/room/${roomID}`)
            }}>JOIN ROOM</button>
          </li>
        })}
      </ul>
      <button onClick={() => {
        history.push(`/room/${v4()}`)
      }}>Create New Room</button>
    </div>
  );
}
